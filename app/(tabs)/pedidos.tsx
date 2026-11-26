import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Alert,
  RefreshControl,
  StatusBar,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

interface ProdutoCardapio {
  id: string
  nome: string
  descricao?: string | null
  preco: number
  estoque: number | null
  categoria_id: string | null
  categoriaNome: string
  foto_url?: string | null
  ativo: boolean
}

interface ItemCarrinho {
  produto: ProdutoCardapio
  quantidade: number
}

interface Dependente {
  id: string
  nome: string
  saldo: number
  limite_diario: number
  escola_id?: string
  bloqueado: boolean
  tipo: 'aluno' | 'responsavel'
  alergias?: string | null
}

const formatarMoeda = (valor: number) =>
  `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`

function obterDataHojeISO(): string {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function obterDataAmanhaISO(): string {
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  const ano = amanha.getFullYear()
  const mes = String(amanha.getMonth() + 1).padStart(2, '0')
  const dia = String(amanha.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function normalizarDataRetirada(valor: string): string {
  const limpo = valor.trim()
  const brMatch = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`
  }
  return limpo
}

function formatarDataBR(iso: string): string {
  if (!iso || !iso.includes('-')) return iso
  return iso.split('-').reverse().join('/')
}

export default function PedidosScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const dataHoje = useMemo(() => obterDataHojeISO(), [])

  // Cardápio e filtros
  const [produtos, setProdutos] = useState<ProdutoCardapio[]>([])
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('Todas')
  const [busca, setBusca] = useState('')
  const [imagensComErro, setImagensComErro] = useState<Record<string, boolean>>({})

  // Consumidor e modalidade (Espelho do Portal Web)
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [modalidade, setModalidade] = useState<'agora' | 'agendado'>('agora')
  const [dataRetirada, setDataRetirada] = useState<string>(dataHoje)

  // Regras e restrições do perfil selecionado
  const [categoriasBloqueadasIds, setCategoriasBloqueadasIds] = useState<Set<string>>(new Set())
  const [categoriasBloqueadasNomes, setCategoriasBloqueadasNomes] = useState<Set<string>>(new Set())
  const [restricoesSaude, setRestricoesSaude] = useState<string[]>([])
  const [carregandoRegras, setCarregandoRegras] = useState(false)

  // Carrinho e Checkout
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [observacao, setObservacao] = useState('')
  const [modalCheckoutVisible, setModalCheckoutVisible] = useState(false)
  const [processandoPedido, setProcessandoPedido] = useState(false)

  // Modais de Feedback e Estados de Tela
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sucessoModal, setSucessoModal] = useState(false)
  const [modalSaldoInsuficiente, setModalSaldoInsuficiente] = useState(false)

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  // 1. Carrega carteiras (dependentes + titular), produtos e categorias
  const fetchData = useCallback(async () => {
    try {
      const [{ data: prodData }, { data: catData }, { data: authData }] = await Promise.all([
        supabase.from('produtos').select('*').order('nome', { ascending: true }),
        supabase.from('categorias').select('id, nome'),
        supabase.auth.getUser(),
      ])

      const mapaCategorias = new Map<string, string>(
        (catData || []).map((c: any) => [String(c.id), String(c.nome || 'Geral')])
      )

      const produtosMapeados: ProdutoCardapio[] = (prodData || [])
        .filter((p: any) => p.ativo !== false && p.disponivel !== false)
        .map((p: any) => {
          const catId = p.categoria_id ? String(p.categoria_id) : null
          const nomeCat =
            (catId && mapaCategorias.get(catId)) ||
            (typeof p.categoria === 'string' && p.categoria.trim() ? p.categoria.trim() : 'Geral')

          const fotoBruta = p.foto_url ?? p.imagem_url ?? p.foto ?? p.imagem ?? null

          return {
            id: String(p.id),
            nome: String(p.nome || 'Produto'),
            descricao: p.descricao ? String(p.descricao) : null,
            preco: Number(p.preco_venda ?? p.preco ?? p.valor ?? 0),
            estoque:
              p.estoque !== null && p.estoque !== undefined
                ? Number(p.estoque)
                : p.esgotado
                ? 0
                : null,
            categoria_id: catId,
            categoriaNome: nomeCat,
            foto_url: typeof fotoBruta === 'string' && fotoBruta.trim() ? fotoBruta.trim() : null,
            ativo: p.ativo !== false,
          }
        })

      setProdutos(produtosMapeados)

      const user = authData?.user
      if (user) {
        const [{ data: perfil }, { data: usuario }] = await Promise.all([
          supabase.from('perfis').select('id').eq('id', user.id).maybeSingle(),
          supabase
            .from('usuarios')
            .select('id')
            .or(`id.eq.${user.id},email.eq.${user.email}`)
            .maybeSingle(),
        ])

        const responsavelId = usuario?.id || perfil?.id || user.id
        const mapaAlunos = new Map<string, any>()

        const { data: diretos } = await supabase
          .from('alunos')
          .select('*')
          .eq('responsavel_id', responsavelId)
          .order('nome', { ascending: true })

        if (diretos) {
          diretos.forEach((a: any) => mapaAlunos.set(String(a.id), a))
        }

        const [vincPlural, vincSingular] = await Promise.allSettled([
          supabase.from('responsaveis_alunos').select('aluno_id').eq('responsavel_id', responsavelId),
          supabase.from('responsavel_aluno').select('aluno_id').eq('responsavel_id', responsavelId),
        ])

        const idsExtras: string[] = []
        if (vincPlural.status === 'fulfilled' && vincPlural.value.data) {
          vincPlural.value.data.forEach((v: any) => idsExtras.push(String(v.aluno_id)))
        }
        if (vincSingular.status === 'fulfilled' && vincSingular.value.data) {
          vincSingular.value.data.forEach((v: any) => idsExtras.push(String(v.aluno_id)))
        }

        const idsNaoCarregados = [...new Set(idsExtras)].filter((id) => !mapaAlunos.has(id))
        if (idsNaoCarregados.length > 0) {
          const { data: porIds } = await supabase
            .from('alunos')
            .select('*')
            .in('id', idsNaoCarregados)
            .order('nome', { ascending: true })

          if (porIds) {
            porIds.forEach((a: any) => mapaAlunos.set(String(a.id), a))
          }
        }

        const alunosLista = Array.from(mapaAlunos.values())

        if (alunosLista.length > 0) {
          const alunoIds = alunosLista.map((a: any) => a.id)
          const carteirasMap: Record<
            string,
            { saldo: number; limite_diario: number; bloqueado: boolean }
          > = {}

          const { data: carteirasData } = await supabase
            .from('carteiras')
            .select('*')
            .in('aluno_id', alunoIds)

          if (carteirasData) {
            carteirasData.forEach((c: any) => {
              const valSaldo = Number(
                c.saldo ?? c.saldo_dinheiro ?? c.saldo_atual ?? c.valor ?? 0
              )
              const valLimite = Number(c.limite_diario ?? c.limite ?? 0)
              const isBloqueado = Boolean(
                c.bloqueada || c.bloqueado || c.status === 'bloqueado'
              )
              carteirasMap[String(c.aluno_id)] = {
                saldo: valSaldo,
                limite_diario: valLimite,
                bloqueado: isBloqueado,
              }
            })
          }

          const list: Dependente[] = alunosLista.map((a: any) => {
            const aid = String(a.id)
            const infoCarteira = carteirasMap[aid]
            const saldoFinal =
              infoCarteira !== undefined
                ? infoCarteira.saldo
                : Number(a.saldo ?? a.saldo_atual ?? 0)
            const limiteFinal =
              infoCarteira !== undefined
                ? infoCarteira.limite_diario
                : Number(a.limite_diario ?? a.limite ?? 0)
            const isBloqueado = Boolean(
              infoCarteira?.bloqueado || a.cartao_bloqueado === true || a.bloqueado === true
            )
            const ehResponsavel = a.tipo === 'responsavel' || Boolean(a.is_self)

            return {
              id: aid,
              nome: a.nome || 'Aluno',
              saldo: saldoFinal,
              limite_diario: limiteFinal,
              escola_id: a.escola_id,
              bloqueado: isBloqueado,
              tipo: ehResponsavel ? 'responsavel' : 'aluno',
              alergias: a.alergias || a.restricoes_alimentares || null,
            }
          })

          setDependentes(list)
          setAlunoSelecionado((prev) =>
            prev ? list.find((item) => item.id === prev.id) || list[0] : list[0]
          )
        } else {
          setDependentes([])
          setAlunoSelecionado(null)
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados da cantina:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('carteiras_produtos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carteiras' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  // 2. Carrega restrições alimentares e categorias bloqueadas do consumidor selecionado (Idêntico ao Portal Web)
  const carregarRegrasDoAluno = useCallback(async (aluno: Dependente | null) => {
    if (!aluno) {
      setCategoriasBloqueadasIds(new Set())
      setCategoriasBloqueadasNomes(new Set())
      setRestricoesSaude([])
      return
    }

    setCarregandoRegras(true)
    try {
      const [{ data: restricoesData }, { data: carteiraData }] = await Promise.all([
        supabase
          .from('restricoes_alimentares')
          .select('id, tipo, descricao, ativo')
          .eq('aluno_id', aluno.id)
          .eq('ativo', true),
        supabase.from('carteiras').select('id').eq('aluno_id', aluno.id).maybeSingle(),
      ])

      const nomesBloqueados = new Set<string>()
      const alertasSaude: string[] = []

      if (aluno.alergias) {
        aluno.alergias
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .forEach((s) => alertasSaude.push(s))
      }

      ;(restricoesData || []).forEach((item: any) => {
        const tipo = String(item.tipo || '').trim()
        const desc = String(item.descricao || '').trim()
        if (!desc) return

        if (tipo === 'Bloqueio de Categoria') {
          nomesBloqueados.add(desc.toLowerCase())
        } else {
          alertasSaude.push(desc.toLowerCase())
        }
      })

      const idsBloqueados = new Set<string>()
      if (carteiraData?.id) {
        const { data: catsRestritas } = await supabase
          .from('restricoes_categorias')
          .select('categoria_id, permitida')
          .eq('carteira_id', carteiraData.id)

        ;(catsRestritas || []).forEach((r: any) => {
          if (r.permitida === false && r.categoria_id) {
            idsBloqueados.add(String(r.categoria_id))
          }
        })
      }

      setCategoriasBloqueadasIds(idsBloqueados)
      setCategoriasBloqueadasNomes(nomesBloqueados)
      setRestricoesSaude([...new Set(alertasSaude)])
    } catch {
      setCategoriasBloqueadasIds(new Set())
      setCategoriasBloqueadasNomes(new Set())
      setRestricoesSaude([])
    } finally {
      setCarregandoRegras(false)
    }
  }, [])

  useEffect(() => {
    carregarRegrasDoAluno(alunoSelecionado)
  }, [alunoSelecionado, carregarRegrasDoAluno])

  const onRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const categoriasDisponiveis = useMemo(() => {
    const setCats = new Set<string>(['Todas'])
    produtos.forEach((p) => {
      if (p.categoriaNome) setCats.add(p.categoriaNome)
    })
    return Array.from(setCats)
  }, [produtos])

  const verificarCategoriaBloqueada = useCallback(
    (produto: ProdutoCardapio): boolean => {
      if (produto.categoria_id && categoriasBloqueadasIds.has(produto.categoria_id)) {
        return true
      }
      if (categoriasBloqueadasNomes.has(produto.categoriaNome.toLowerCase().trim())) {
        return true
      }
      return false
    },
    [categoriasBloqueadasIds, categoriasBloqueadasNomes]
  )

  const verificarConflitoSaude = useCallback(
    (produto: ProdutoCardapio): boolean => {
      if (restricoesSaude.length === 0) return false
      const textoProduto = `${produto.nome} ${produto.descricao || ''}`.toLowerCase()
      return restricoesSaude.some((rest) => {
        const palavras = rest.split(/[\s,()/.-]+/).filter((w) => w.length >= 4)
        return palavras.some((palavra) => textoProduto.includes(palavra))
      })
    },
    [restricoesSaude]
  )

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return produtos.filter((p) => {
      if (categoriaSelecionada !== 'Todas' && p.categoriaNome !== categoriaSelecionada) {
        return false
      }
      if (
        termo &&
        !p.nome.toLowerCase().includes(termo) &&
        !(p.descricao || '').toLowerCase().includes(termo)
      ) {
        return false
      }
      return true
    })
  }, [produtos, categoriaSelecionada, busca])

  const handleAdicionarItem = (produto: ProdutoCardapio) => {
    if (verificarCategoriaBloqueada(produto)) {
      mostrarAviso(
        'Categoria Bloqueada',
        `A categoria "${produto.categoriaNome}" está bloqueada para esta carteira.`
      )
      return
    }

    if (produto.estoque !== null && produto.estoque <= 0) {
      mostrarAviso('Sem Estoque', `O item "${produto.nome}" está indisponível no momento.`)
      return
    }

    setCarrinho((prev) => {
      const existe = prev.find((i) => i.produto.id === produto.id)
      if (existe) {
        if (produto.estoque !== null && existe.quantidade >= produto.estoque) {
          mostrarAviso(
            'Estoque máximo',
            `Quantidade máxima disponível em estoque para "${produto.nome}" atingida.`
          )
          return prev
        }
        return prev.map((i) =>
          i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
        )
      }
      return [...prev, { produto, quantidade: 1 }]
    })
  }

  const handleRemoverItem = (produtoId: string) => {
    setCarrinho((prev) =>
      prev
        .map((i) =>
          i.produto.id === produtoId ? { ...i, quantidade: i.quantidade - 1 } : i
        )
        .filter((i) => i.quantidade > 0)
    )
  }

  const quantidadeTotal = carrinho.reduce((acc, item) => acc + item.quantidade, 0)
  const valorTotalCarrinho = carrinho.reduce(
    (acc, item) => acc + item.produto.preco * item.quantidade,
    0
  )

  // 3. Finalização do pedido (100% compatível com o Portal Web, Admin e Totem)
  const handleFinalizarPedido = async () => {
    if (carrinho.length === 0) return

    if (!alunoSelecionado) {
      mostrarAviso('Atenção', 'Selecione quem vai consumir para realizar o pedido.')
      return
    }

    if (alunoSelecionado.bloqueado) {
      mostrarAviso(
        'Carteira Bloqueada',
        'O consumo desta carteira está bloqueado. Libere-o na aba Dependentes.'
      )
      return
    }

    const dataEfetiva = modalidade === 'agora' ? dataHoje : normalizarDataRetirada(dataRetirada)
    if (modalidade === 'agendado' && (!dataEfetiva || dataEfetiva < dataHoje)) {
      mostrarAviso('Data Inválida', 'Escolha uma data válida (hoje ou futura) para retirada.')
      return
    }

    setProcessandoPedido(true)

    try {
      const { data: carteira } = await supabase
        .from('carteiras')
        .select('id, saldo, bloqueada, limite_diario')
        .eq('aluno_id', alunoSelecionado.id)
        .maybeSingle()

      if (!carteira) {
        throw new Error('Carteira não encontrada para o perfil selecionado.')
      }

      if (carteira.bloqueada) {
        throw new Error('Esta carteira está bloqueada no momento.')
      }

      const saldoAtual = Number(carteira.saldo || 0)
      const limiteConfigurado = Number(
        carteira.limite_diario || alunoSelecionado.limite_diario || 0
      )

      if (limiteConfigurado > 0 && valorTotalCarrinho > limiteConfigurado) {
        throw new Error(
          `O valor do pedido (${formatarMoeda(valorTotalCarrinho)}) excede o limite diário configurado (${formatarMoeda(
            limiteConfigurado
          )}).`
        )
      }

      if (saldoAtual < valorTotalCarrinho) {
        setProcessandoPedido(false)
        setModalSaldoInsuficiente(true)
        return
      }

      const novoSaldo = saldoAtual - valorTotalCarrinho
      const resumoItens = carrinho
        .map((i) => `${i.quantidade}x ${i.produto.nome}`)
        .join(', ')

      const obsFinal = [
        modalidade === 'agendado'
          ? `AGENDADO (${formatarDataBR(dataEfetiva)})`
          : 'RETIRADA IMEDIATA',
        resumoItens,
        observacao.trim() ? `Obs: ${observacao.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      // 1. Debita saldo da carteira
      const { error: errCarteira } = await supabase
        .from('carteiras')
        .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
        .eq('id', carteira.id)

      if (errCarteira) throw errCarteira

      await supabase.from('alunos').update({ saldo: novoSaldo }).eq('id', alunoSelecionado.id)

      // 2. Cria pedido (mesmo schema do Portal Web)
      const { data: pedidoCriado, error: errPedido } = await supabase
        .from('pedidos')
        .insert([
          {
            aluno_id: alunoSelecionado.id,
            valor_total: valorTotalCarrinho,
            status: 'pago',
            observacoes: obsFinal,
          },
        ])
        .select('id')
        .maybeSingle()

      if (errPedido) throw errPedido

      // 3. Registra itens do pedido
      if (pedidoCriado?.id) {
        await supabase.from('itens_pedido').insert(
          carrinho.map((item) => ({
            pedido_id: pedidoCriado.id,
            produto_id: item.produto.id,
            quantidade: item.quantidade,
            preco_unitario: item.produto.preco,
            subtotal: item.produto.preco * item.quantidade,
          }))
        )
      }

      // 4. Registra no extrato (mesmo schema do Portal Web)
      await supabase.from('extrato').insert([
        {
          carteira_id: carteira.id,
          aluno_id: alunoSelecionado.id,
          tipo: 'debito',
          valor: valorTotalCarrinho,
          descricao: `Pedido Online (${
            modalidade === 'agora' ? 'Hoje' : formatarDataBR(dataEfetiva)
          }): ${resumoItens}`,
        },
      ])

      // 5. Baixa estoque dos produtos
      for (const item of carrinho) {
        if (item.produto.estoque !== null) {
          const novoEstoque = Math.max(0, item.produto.estoque - item.quantidade)
          await supabase
            .from('produtos')
            .update({ estoque: novoEstoque })
            .eq('id', item.produto.id)
        }
      }

      setModalCheckoutVisible(false)
      setCarrinho([])
      setObservacao('')
      setSucessoModal(true)
      fetchData()
    } catch (err: any) {
      mostrarAviso('Erro no Pedido', err.message || 'Erro ao finalizar o pedido.')
    } finally {
      setProcessandoPedido(false)
    }
  }

  const handleIrParaRecarga = () => {
    setModalSaldoInsuficiente(false)
    setModalCheckoutVisible(false)
    router.push('/(tabs)/recarregar' as any)
  }

  const temRegrasAtivas =
    alunoSelecionado &&
    !carregandoRegras &&
    (alunoSelecionado.bloqueado ||
      restricoesSaude.length > 0 ||
      categoriasBloqueadasIds.size > 0 ||
      categoriasBloqueadasNomes.size > 0)

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Cabeçalho Institucional (Espelho do Portal Web) */}
      <View
        style={[
          styles.topHeader,
          { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 20 : 40) + 6 },
        ]}
      >
        <View style={styles.topAccentCircle} />
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>CANTINA ONLINE MENU COFFEE BREAK</Text>
        </View>
        <Text style={styles.title}>
          {modalidade === 'agora' ? 'Compra Direta' : 'Pedido Agendado'}
        </Text>
        <Text style={styles.subtitle}>
          {modalidade === 'agora'
            ? 'Faça o pedido agora para envio imediato à cozinha e retirada no balcão.'
            : 'Programe o lanche com antecedência para a data desejada.'}
        </Text>

        {/* Barra de Busca */}
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar lanche ou bebida..."
            placeholderTextColor="#94A3B8"
            value={busca}
            onChangeText={setBusca}
          />
          {busca.length > 0 && (
            <TouchableOpacity onPress={() => setBusca('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Área Principal Branca */}
      <View style={styles.bodyContainer}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 18,
            paddingHorizontal: 20,
            paddingBottom: carrinho.length > 0 ? 110 : 32,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1E62D0']}
            />
          }
        >
          {/* BLOCO 1: MODALIDADE & CONSUMIDOR (IDÊNTICO AO PORTAL WEB) */}
          <View style={styles.configCard}>
            <Text style={styles.sectionMiniLabel}>MODALIDADE DO PEDIDO</Text>
            <View style={styles.modalidadeRow}>
              <TouchableOpacity
                style={[
                  styles.modalidadeBtn,
                  modalidade === 'agora' && styles.modalidadeBtnActive,
                ]}
                onPress={() => {
                  setModalidade('agora')
                  setDataRetirada(dataHoje)
                }}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="time-outline"
                  size={15}
                  color={modalidade === 'agora' ? '#FFFFFF' : '#334155'}
                />
                <Text
                  style={[
                    styles.modalidadeBtnText,
                    modalidade === 'agora' && styles.modalidadeBtnTextActive,
                  ]}
                >
                  Comprar Agora (Hoje)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalidadeBtn,
                  modalidade === 'agendado' && styles.modalidadeBtnActive,
                ]}
                onPress={() => {
                  setModalidade('agendado')
                  if (dataRetirada === dataHoje) {
                    setDataRetirada(obterDataAmanhaISO())
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={modalidade === 'agendado' ? '#FFFFFF' : '#334155'}
                />
                <Text
                  style={[
                    styles.modalidadeBtnText,
                    modalidade === 'agendado' && styles.modalidadeBtnTextActive,
                  ]}
                >
                  Agendar Outro Dia
                </Text>
              </TouchableOpacity>
            </View>

            {/* Seletor de Data quando Agendado */}
            {modalidade === 'agendado' && (
              <View style={styles.agendamentoBox}>
                <Text style={styles.sectionMiniLabel}>DATA DA RETIRADA (DD/MM/AAAA)</Text>
                <View style={styles.agendamentoQuickRow}>
                  <TouchableOpacity
                    style={[
                      styles.quickDateChip,
                      dataRetirada === obterDataAmanhaISO() && styles.quickDateChipActive,
                    ]}
                    onPress={() => setDataRetirada(obterDataAmanhaISO())}
                  >
                    <Text
                      style={[
                        styles.quickDateChipText,
                        dataRetirada === obterDataAmanhaISO() && styles.quickDateChipTextActive,
                      ]}
                    >
                      Amanhã ({formatarDataBR(obterDataAmanhaISO())})
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.dateInput}
                  value={formatarDataBR(dataRetirada)}
                  onChangeText={(txt) => setDataRetirada(normalizarDataRetirada(txt))}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}

            {/* Quem vai consumir */}
            <Text style={[styles.sectionMiniLabel, { marginTop: 12 }]}>
              QUEM VAI CONSUMIR (ALUNO OU TITULAR)
            </Text>
            {dependentes.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.consumidorRow}
              >
                {dependentes.map((dep) => {
                  const isSel = alunoSelecionado?.id === dep.id
                  return (
                    <TouchableOpacity
                      key={dep.id}
                      style={[styles.consumidorChip, isSel && styles.consumidorChipSel]}
                      onPress={() => {
                        setAlunoSelecionado(dep)
                        setCarrinho([])
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={dep.tipo === 'responsavel' ? 'wallet' : 'person'}
                        size={14}
                        color={isSel ? '#FFFFFF' : '#1E62D0'}
                      />
                      <Text
                        style={[
                          styles.consumidorChipText,
                          isSel && styles.consumidorChipTextSel,
                        ]}
                      >
                        {dep.nome.split(' ')[0]} ({formatarMoeda(dep.saldo)})
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            ) : (
              <Text style={styles.semDependenteText}>
                Nenhum dependente ou carteira vinculado.
              </Text>
            )}

            {/* Alerta de Saldo Zerado com Atalho de Recarga */}
            {alunoSelecionado && Number(alunoSelecionado.saldo || 0) <= 0 && (
              <View style={styles.saldoZeroBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.saldoZeroText}>
                    Carteira com saldo R$ 0,00. Adicione créditos via PIX para finalizar pedidos.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.saldoZeroBtn}
                  onPress={() => router.push('/(tabs)/recarregar' as any)}
                >
                  <Text style={styles.saldoZeroBtnText}>RECARREGAR</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Aviso de Regras / Restrições Ativas */}
            {temRegrasAtivas && (
              <View style={styles.regrasBanner}>
                <Ionicons name="shield-checkmark" size={16} color="#B45309" />
                <Text style={styles.regrasBannerText}>
                  Regras ativas para {alunoSelecionado.nome.split(' ')[0]}:{' '}
                  {alunoSelecionado.bloqueado ? '[Consumo Bloqueado] ' : ''}
                  {categoriasBloqueadasIds.size > 0 || categoriasBloqueadasNomes.size > 0
                    ? '[Categorias restritas] '
                    : ''}
                  {restricoesSaude.length > 0 ? restricoesSaude.join(', ') : ''}
                </Text>
              </View>
            )}
          </View>

          {/* BLOCO 2: ABAS DE CATEGORIAS */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catScrollView}
          >
            {categoriasDisponiveis.map((cat) => {
              const isSelected = categoriaSelecionada === cat
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, isSelected && styles.catChipSelected]}
                  onPress={() => setCategoriaSelecionada(cat)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.catChipText, isSelected && styles.catChipTextSelected]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* BLOCO 3: CARDÁPIO DISPONÍVEL */}
          {loading ? (
            <ActivityIndicator size="large" color="#1E62D0" style={{ marginVertical: 48 }} />
          ) : produtosFiltrados.length > 0 ? (
            <View style={styles.productList}>
              {produtosFiltrados.map((item) => {
                const noCarrinho = carrinho.find((i) => i.produto.id === item.id)
                const quantidade = noCarrinho?.quantidade || 0
                const semEstoque = item.estoque !== null && item.estoque <= 0
                const catBloqueada = verificarCategoriaBloqueada(item)
                const alertaSaude = verificarConflitoSaude(item)
                const indisponivel = semEstoque || catBloqueada
                const mostrarFoto = Boolean(item.foto_url) && !imagensComErro[item.id]

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.productCard,
                      indisponivel && styles.productCardEsgotado,
                      alertaSaude && !indisponivel && styles.productCardAlertaSaude,
                    ]}
                  >
                    {/* Imagem do Produto */}
                    <View style={styles.productImgBox}>
                      {mostrarFoto ? (
                        <Image
                          source={{ uri: item.foto_url as string }}
                          style={styles.productImg}
                          resizeMode="contain"
                          onError={() =>
                            setImagensComErro((prev) => ({ ...prev, [item.id]: true }))
                          }
                        />
                      ) : (
                        <Ionicons name="fast-food-outline" size={26} color="#1E62D0" />
                      )}
                    </View>

                    {/* Detalhes do Produto */}
                    <View style={styles.productInfo}>
                      <View style={styles.productHeaderRow}>
                        <Text
                          style={[styles.productName, indisponivel && styles.productNameEsgotado]}
                          numberOfLines={1}
                        >
                          {item.nome}
                        </Text>

                        {catBloqueada ? (
                          <View style={styles.badgeEsgotado}>
                            <Text style={styles.badgeEsgotadoText}>BLOQUEADA</Text>
                          </View>
                        ) : semEstoque ? (
                          <View style={styles.badgeEsgotado}>
                            <Text style={styles.badgeEsgotadoText}>INDISPONÍVEL</Text>
                          </View>
                        ) : item.estoque !== null ? (
                          <View style={styles.badgeEstoque}>
                            <Text style={styles.badgeEstoqueText}>Restam {item.estoque}</Text>
                          </View>
                        ) : null}
                      </View>

                      <Text style={styles.productCatSub}>{item.categoriaNome}</Text>

                      {alertaSaude && !catBloqueada && (
                        <View style={styles.alertaSaudeTag}>
                          <Ionicons name="warning" size={11} color="#BE123C" />
                          <Text style={styles.alertaSaudeTagText}>Alerta Restrição</Text>
                        </View>
                      )}

                      <Text
                        style={[styles.productPrice, indisponivel && styles.productPriceEsgotado]}
                      >
                        {formatarMoeda(item.preco)}
                      </Text>
                    </View>

                    {/* Ação */}
                    {catBloqueada ? (
                      <View style={styles.btnIndisponivel}>
                        <Text style={styles.btnIndisponivelText}>Bloqueada</Text>
                      </View>
                    ) : semEstoque ? (
                      <View style={styles.btnIndisponivel}>
                        <Text style={styles.btnIndisponivelText}>Sem Estoque</Text>
                      </View>
                    ) : quantidade > 0 ? (
                      <View style={styles.qtyControls}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => handleRemoverItem(item.id)}
                        >
                          <Ionicons name="remove" size={16} color="#1E62D0" />
                        </TouchableOpacity>

                        <Text style={styles.qtyText}>{quantidade}</Text>

                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => handleAdicionarItem(item)}
                        >
                          <Ionicons name="add" size={16} color="#1E62D0" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addCtaBtn}
                        onPress={() => handleAdicionarItem(item)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                        <Text style={styles.addCtaText}>Adicionar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="fast-food-outline" size={36} color="#1E62D0" />
              </View>
              <Text style={styles.emptyTitle}>Nenhum produto encontrado</Text>
              <Text style={styles.emptySub}>
                Nenhum item encontrado no cardápio para este filtro.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* BARRA FLUTUANTE DO CARRINHO */}
        {carrinho.length > 0 && (
          <View style={styles.floatingCartBar}>
            <View>
              <Text style={styles.cartBarCount}>
                {quantidadeTotal} {quantidadeTotal === 1 ? 'item' : 'itens'} •{' '}
                {alunoSelecionado?.nome.split(' ')[0] || ''}
              </Text>
              <Text style={styles.cartBarTotal}>{formatarMoeda(valorTotalCarrinho)}</Text>
            </View>

            <TouchableOpacity
              style={styles.cartCheckoutBtn}
              onPress={() => setModalCheckoutVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="bag-check-outline" size={18} color="#FFFFFF" />
              <Text style={styles.cartCheckoutBtnText}>RESUMO DO PEDIDO</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* MODAL 1: RESUMO E CONFIRMAÇÃO DO PEDIDO (ESPELHO DO PORTAL WEB) */}
      <Modal
        visible={modalCheckoutVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!processandoPedido) setModalCheckoutVisible(false)
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTag}>
                  {modalidade === 'agora'
                    ? 'COMPRA DIRETA • HOJE'
                    : `AGENDADO • ${formatarDataBR(dataRetirada)}`}
                </Text>
                <Text style={styles.modalTitle}>Resumo do Pedido</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setModalCheckoutVisible(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Perfil Consumidor e Saldo */}
              {alunoSelecionado && (
                <View style={styles.checkoutConsumerBox}>
                  <View>
                    <Text style={styles.checkoutConsumerLabel}>CONSUMIDOR</Text>
                    <Text style={styles.checkoutConsumerName}>{alunoSelecionado.nome}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.checkoutConsumerLabel}>SALDO DISPONÍVEL</Text>
                    <Text style={styles.checkoutConsumerSaldo}>
                      {formatarMoeda(alunoSelecionado.saldo)}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.modalSectionLabel}>ITENS DO CARRINHO</Text>
              <View style={styles.itemsBox}>
                {carrinho.map((item) => (
                  <View key={item.produto.id} style={styles.cartItemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.cartItemName}>
                        <Text style={{ fontWeight: '800', color: '#1E62D0' }}>
                          {item.quantidade}x{' '}
                        </Text>
                        {item.produto.nome}
                      </Text>
                    </View>

                    <View style={styles.checkoutQtyRow}>
                      <TouchableOpacity
                        style={styles.checkoutQtyBtn}
                        onPress={() => handleRemoverItem(item.produto.id)}
                      >
                        <Ionicons name="remove" size={14} color="#334155" />
                      </TouchableOpacity>
                      <Text style={styles.cartItemPrice}>
                        {formatarMoeda(item.produto.preco * item.quantidade)}
                      </Text>
                      <TouchableOpacity
                        style={styles.checkoutQtyBtn}
                        onPress={() => handleAdicionarItem(item.produto)}
                      >
                        <Ionicons name="add" size={14} color="#334155" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={styles.modalSectionLabel}>OBSERVAÇÃO (OPCIONAL)</Text>
              <TextInput
                style={styles.obsInput}
                value={observacao}
                onChangeText={setObservacao}
                placeholder="Ex: Sem gelo, aquecer lanche..."
                placeholderTextColor="#94A3B8"
              />

              <View style={styles.totalBoxRow}>
                <Text style={styles.totalBoxLabel}>TOTAL DO PEDIDO</Text>
                <Text style={styles.totalBoxValue}>{formatarMoeda(valorTotalCarrinho)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.payConfirmBtn, processandoPedido && styles.payConfirmBtnDisabled]}
                onPress={handleFinalizarPedido}
                disabled={processandoPedido}
                activeOpacity={0.85}
              >
                {processandoPedido ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.payConfirmBtnText}>CONFIRMAR PEDIDO</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: SALDO INSUFICIENTE */}
      <Modal
        visible={modalSaldoInsuficiente}
        animationType="fade"
        transparent
        onRequestClose={() => setModalSaldoInsuficiente(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.modalCardCenter, { alignItems: 'center', paddingVertical: 28 }]}>
            <View style={styles.warningIconBadge}>
              <Ionicons name="warning-outline" size={34} color="#F27835" />
            </View>

            <Text style={styles.warningTitle}>Saldo Insuficiente!</Text>
            <Text style={styles.warningSub}>
              A carteira de{' '}
              <Text style={{ fontWeight: '800', color: '#1E293B' }}>{alunoSelecionado?.nome}</Text>{' '}
              possui{' '}
              <Text style={{ fontWeight: '800', color: '#E11D48' }}>
                {formatarMoeda(alunoSelecionado?.saldo || 0)}
              </Text>
              , mas o valor do pedido é de{' '}
              <Text style={{ fontWeight: '800', color: '#16A34A' }}>
                {formatarMoeda(valorTotalCarrinho)}
              </Text>
              .
            </Text>

            <Text style={styles.rechargeQuestion}>
              Deseja realizar uma recarga PIX agora?
            </Text>

            <View style={styles.warningActionsRow}>
              <TouchableOpacity
                style={styles.cancelWarningBtn}
                onPress={() => setModalSaldoInsuficiente(false)}
              >
                <Text style={styles.cancelWarningText}>VOLTAR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.rechargeWarningBtn}
                onPress={handleIrParaRecarga}
                activeOpacity={0.85}
              >
                <Ionicons name="flash" size={16} color="#FFFFFF" />
                <Text style={styles.rechargeWarningText}>RECARREGAR AGORA</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: SUCESSO */}
      <Modal
        visible={sucessoModal}
        animationType="fade"
        transparent
        onRequestClose={() => setSucessoModal(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.modalCardCenter, { alignItems: 'center', paddingVertical: 30 }]}>
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            <Text style={styles.successTitle}>Pedido Confirmado!</Text>
            <Text style={styles.successSub}>
              Pedido enviado para a cantina e debitado da carteira selecionada.
            </Text>

            <TouchableOpacity
              style={styles.successCloseBtn}
              onPress={() => setSucessoModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.successCloseBtnText}>VOLTAR AO CARDÁPIO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1E2B58',
  },
  topHeader: {
    backgroundColor: '#1E2B58',
    paddingHorizontal: 20,
    paddingBottom: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  topAccentCircle: {
    position: 'absolute',
    right: -50,
    top: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#2853A4',
    opacity: 0.45,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F27835',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 2,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    marginTop: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
  },
  bodyContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  configCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  sectionMiniLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  modalidadeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modalidadeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalidadeBtnActive: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  modalidadeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  modalidadeBtnTextActive: {
    color: '#FFFFFF',
  },
  agendamentoBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  agendamentoQuickRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  quickDateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickDateChipActive: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E62D0',
  },
  quickDateChipTextActive: {
    color: '#FFFFFF',
  },
  dateInput: {
    height: 42,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  consumidorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 10,
  },
  consumidorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  consumidorChipSel: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  consumidorChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  consumidorChipTextSel: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  semDependenteText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  saldoZeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  saldoZeroText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  saldoZeroBtn: {
    backgroundColor: '#F27835',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saldoZeroBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  regrasBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  regrasBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#9A3412',
  },
  catScrollView: {
    marginBottom: 14,
  },
  catChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  catChipSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  catChipTextSelected: {
    color: '#FFFFFF',
  },
  productList: {
    gap: 12,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  productCardEsgotado: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.85,
  },
  productCardAlertaSaude: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  productImgBox: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
    overflow: 'hidden',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  productInfo: {
    flex: 1,
  },
  productHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  productName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  productNameEsgotado: {
    color: '#94A3B8',
  },
  productCatSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  badgeEsgotado: {
    backgroundColor: '#FFE4E6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeEsgotadoText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E11D48',
  },
  badgeEstoque: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeEstoqueText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  alertaSaudeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 4,
  },
  alertaSaudeTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#BE123C',
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E62D0',
    marginTop: 5,
  },
  productPriceEsgotado: {
    color: '#94A3B8',
  },
  btnIndisponivel: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
  },
  btnIndisponivelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  addCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E62D0',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    gap: 4,
  },
  addCtaText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  qtyBtn: {
    padding: 3,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E62D0',
  },
  emptyBox: {
    alignItems: 'center',
    marginVertical: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  floatingCartBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#1E2B58',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cartBarCount: {
    fontSize: 10,
    color: '#BFDBFE',
    fontWeight: '700',
  },
  cartBarTotal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 1,
  },
  cartCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F27835',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    gap: 6,
  },
  cartCheckoutBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F27835',
    letterSpacing: 0.7,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalCloseIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutConsumerBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  checkoutConsumerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },
  checkoutConsumerName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  checkoutConsumerSaldo: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E62D0',
    marginTop: 2,
  },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 8,
    letterSpacing: 0.6,
  },
  itemsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cartItemName: {
    fontSize: 13,
    color: '#334155',
  },
  checkoutQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkoutQtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartItemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  obsInput: {
    height: 44,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 13,
    color: '#1E293B',
    marginBottom: 12,
  },
  totalBoxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 14,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  totalBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  totalBoxValue: {
    fontSize: 19,
    fontWeight: '900',
    color: '#16A34A',
  },
  payConfirmBtn: {
    height: 50,
    backgroundColor: '#F27835',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  payConfirmBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  payConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCardCenter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  warningIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F27835',
  },
  warningSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 10,
  },
  rechargeQuestion: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
    marginBottom: 18,
  },
  warningActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelWarningBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelWarningText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  rechargeWarningBtn: {
    flex: 1.4,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#F27835',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  rechargeWarningText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  successTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
  },
  successSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  successCloseBtn: {
    backgroundColor: '#1E62D0',
    paddingHorizontal: 26,
    height: 46,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  successCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
})