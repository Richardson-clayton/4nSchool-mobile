import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  RefreshControl,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

interface CardapioAlmoco {
  id: string
  escola_id?: string | null
  data_refeicao: string
  dia_semana: string
  titulo: string
  descricao?: string | null
  preco_base: number
  horario_limite?: string | null
  ativo: boolean
}

interface ItemCardapioAlmoco {
  id: string
  cardapio_id: string
  grupo: string
  nome: string
  descricao?: string | null
  obrigatorio: boolean
  max_escolhas: number
  preco_adicional: number
  ordem: number
  ativo: boolean
}

interface ItemEscolhidoSnapshot {
  grupo: string
  item_id: string
  nome: string
  preco_adicional: number
}

interface PedidoAlmocoRow {
  id: string
  cardapio_id: string
  aluno_id?: string | null
  carteira_id?: string | null
  tipo_consumidor: 'aluno' | 'responsavel' | 'funcionario'
  nome_consumidor: string
  data_refeicao: string
  quantidade: number
  itens_escolhidos: ItemEscolhidoSnapshot[]
  observacoes?: string | null
  valor_unitario: number
  valor_total: number
  status: string
  created_at: string
}

interface ConsumidorOpcao {
  id: string
  tipo: 'aluno' | 'responsavel' | 'funcionario'
  usaCarteira: boolean
  nome: string
  subtitulo: string
  saldo: number
  cartaoBloqueado: boolean
  restricoes: string[]
}

const DIAS_UTEIS = [
  { key: 'segunda', label: 'Segunda', curto: 'SEG', offset: 0 },
  { key: 'terca', label: 'Terça', curto: 'TER', offset: 1 },
  { key: 'quarta', label: 'Quarta', curto: 'QUA', offset: 2 },
  { key: 'quinta', label: 'Quinta', curto: 'QUI', offset: 3 },
  { key: 'sexta', label: 'Sexta', curto: 'SEX', offset: 4 },
]

const formatarMoeda = (valor: number) =>
  `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`

function formatarDataLocalISO(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function obterSegundaFeiraDaSemana(offsetSemanas = 0): Date {
  const hoje = new Date()
  const diaSemana = hoje.getDay()
  const diffParaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana
  return new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate() + diffParaSegunda + offsetSemanas * 7
  )
}

export default function AlmocoScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [userId, setUserId] = useState<string>('')
  const [consumidores, setConsumidores] = useState<ConsumidorOpcao[]>([])
  const [consumidorSelecionadoId, setConsumidorSelecionadoId] = useState<string>('')
  const [temCarteiraPessoal, setTemCarteiraPessoal] = useState<boolean>(false)
  const [ativandoCarteiraPessoal, setAtivandoCarteiraPessoal] = useState<boolean>(false)

  const [offsetSemana, setOffsetSemana] = useState<number>(0)
  const [dataSelecionada, setDataSelecionada] = useState<string>(() =>
    formatarDataLocalISO(new Date())
  )

  const [cardapiosSemana, setCardapiosSemana] = useState<CardapioAlmoco[]>([])
  const [itensCardapioAtual, setItensCardapioAtual] = useState<ItemCardapioAlmoco[]>([])
  const [restricoesAluno, setRestricoesAluno] = useState<string[]>([])

  const [escolhasPorGrupo, setEscolhasPorGrupo] = useState<Record<string, string[]>>({})
  const [quantidade, setQuantidade] = useState<number>(1)
  const [observacoes, setObservacoes] = useState<string>('')

  const [meusPedidos, setMeusPedidos] = useState<PedidoAlmocoRow[]>([])

  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [carregandoCardapio, setCarregandoCardapio] = useState(false)
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  const diasDaSemanaAtual = useMemo(() => {
    const segunda = obterSegundaFeiraDaSemana(offsetSemana)
    return DIAS_UTEIS.map((d) => {
      const dataObj = new Date(
        segunda.getFullYear(),
        segunda.getMonth(),
        segunda.getDate() + d.offset
      )
      return {
        ...d,
        dataISO: formatarDataLocalISO(dataObj),
        diaMes: `${String(dataObj.getDate()).padStart(2, '0')}/${String(
          dataObj.getMonth() + 1
        ).padStart(2, '0')}`,
      }
    })
  }, [offsetSemana])

  useEffect(() => {
    const hojeISO = formatarDataLocalISO(new Date())
    const diaHojeNaSemana = diasDaSemanaAtual.find((d) => d.dataISO === hojeISO)
    if (diaHojeNaSemana) {
      setDataSelecionada(diaHojeNaSemana.dataISO)
    } else if (diasDaSemanaAtual.length > 0) {
      setDataSelecionada(diasDaSemanaAtual[0].dataISO)
    }
  }, [diasDaSemanaAtual])

  const carregarConsumidores = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const listaOpcoes: ConsumidorOpcao[] = []
      if (!user) {
        setConsumidores([])
        return
      }

      setUserId(user.id)

      const [{ data: perfil }, { data: usuario }] = await Promise.all([
        supabase.from('perfis').select('id, nome, role').eq('id', user.id).maybeSingle(),
        supabase
          .from('usuarios')
          .select('id, nome, escola_id')
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
      const alunoIds = alunosLista.map((a: any) => a.id)

      const carteirasMap: Record<string, { saldo: number; bloqueada: boolean }> = {}
      if (alunoIds.length > 0) {
        const { data: carteirasData } = await supabase
          .from('carteiras')
          .select('*')
          .in('aluno_id', alunoIds)

        if (carteirasData) {
          carteirasData.forEach((c: any) => {
            carteirasMap[String(c.aluno_id)] = {
              saldo: Number(c.saldo ?? c.saldo_atual ?? 0),
              bloqueada: Boolean(c.bloqueada || c.bloqueado || c.status === 'bloqueado'),
            }
          })
        }
      }

      let possuiCarteiraTitular = false

      alunosLista.forEach((a: any) => {
        const aid = String(a.id)
        const ehResponsavel = a.tipo === 'responsavel' || Boolean(a.is_self)
        if (ehResponsavel) possuiCarteiraTitular = true

        const infoCarteira = carteirasMap[aid]
        const restricoesArr = Array.isArray(a.restricoes)
          ? a.restricoes
          : typeof a.alergias === 'string' && a.alergias.trim()
          ? a.alergias.split(',').map((s: string) => s.trim())
          : []

        listaOpcoes.push({
          id: aid,
          tipo: ehResponsavel ? 'responsavel' : 'aluno',
          usaCarteira: true,
          nome: a.nome || 'Aluno',
          subtitulo: a.turma || (a.matricula ? `Matrícula ${a.matricula}` : 'Aluno'),
          saldo:
            infoCarteira !== undefined
              ? infoCarteira.saldo
              : Number(a.saldo ?? a.saldo_atual ?? 0),
          cartaoBloqueado: Boolean(
            infoCarteira?.bloqueada || a.cartao_bloqueado === true || a.bloqueado === true
          ),
          restricoes: restricoesArr,
        })
      })

      setTemCarteiraPessoal(possuiCarteiraTitular)

      const role = String(perfil?.role || '').toLowerCase()
      const ehFuncionario =
        role === 'funcionario' || role === 'professor' || role === 'colaborador'

      if (ehFuncionario && !possuiCarteiraTitular) {
        listaOpcoes.push({
          id: `func-${user.id}`,
          tipo: 'funcionario',
          usaCarteira: false,
          nome: perfil?.nome || usuario?.nome || 'Meu Consumo (Equipe)',
          subtitulo: 'Colaborador / Equipe Escolar',
          saldo: 0,
          cartaoBloqueado: false,
          restricoes: [],
        })
      }

      setConsumidores(listaOpcoes)
      if (listaOpcoes.length > 0) {
        setConsumidorSelecionadoId((atual) =>
          atual && listaOpcoes.some((c) => c.id === atual) ? atual : listaOpcoes[0].id
        )
      }
    } finally {
      setCarregandoInicial(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    carregarConsumidores()
  }, [carregarConsumidores])

  const handleAtivarCarteiraPessoal = async () => {
    setAtivandoCarteiraPessoal(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado.')

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, nome, email, cpf, escola_id')
        .or(`id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle()

      const responsavelId = usuario?.id || user.id
      const nomeTitular =
        usuario?.nome || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Titular'

      const { data: criado, error: errAluno } = await supabase
        .from('alunos')
        .insert([
          {
            nome: nomeTitular,
            responsavel_id: responsavelId,
            escola_id: usuario?.escola_id || null,
            tipo: 'responsavel',
            is_self: true,
            turma: 'Carteira Pessoal',
            saldo: 0,
          },
        ])
        .select('id')
        .single()

      if (errAluno) throw errAluno

      if (criado?.id) {
        await supabase.from('carteiras').insert([
          {
            aluno_id: criado.id,
            saldo: 0,
            bloqueada: false,
          },
        ])
      }

      await carregarConsumidores()
      if (criado?.id) setConsumidorSelecionadoId(String(criado.id))
      mostrarAviso(
        'Carteira Ativada!',
        'Sua Carteira Pessoal foi ativada! Você já pode fazer recargas PIX e pedir seu almoço.'
      )
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Não foi possível ativar sua carteira pessoal.')
    } finally {
      setAtivandoCarteiraPessoal(false)
    }
  }

  const consumidorSelecionado = useMemo(
    () => consumidores.find((c) => c.id === consumidorSelecionadoId),
    [consumidores, consumidorSelecionadoId]
  )

  useEffect(() => {
    async function carregarRestricoes() {
      if (!consumidorSelecionado || !consumidorSelecionado.usaCarteira) {
        setRestricoesAluno([])
        return
      }

      const iniciais = (consumidorSelecionado.restricoes || []).map((r) =>
        r.toLowerCase().trim()
      )

      try {
        const { data } = await supabase
          .from('restricoes_alimentares')
          .select('descricao')
          .eq('aluno_id', consumidorSelecionado.id)
          .eq('ativo', true)

        const daTabela = (data || [])
          .map((r: any) => String(r.descricao || '').toLowerCase().trim())
          .filter(Boolean)

        setRestricoesAluno(Array.from(new Set([...iniciais, ...daTabela])))
      } catch {
        setRestricoesAluno(iniciais)
      }
    }
    carregarRestricoes()
  }, [consumidorSelecionado])

  const carregarCardapiosDaSemana = useCallback(async () => {
    if (diasDaSemanaAtual.length === 0) return
    setCarregandoCardapio(true)

    const inicio = diasDaSemanaAtual[0].dataISO
    const fim = diasDaSemanaAtual[diasDaSemanaAtual.length - 1].dataISO

    try {
      const { data, error } = await supabase
        .from('cardapios_almoco')
        .select('*')
        .gte('data_refeicao', inicio)
        .lte('data_refeicao', fim)
        .eq('ativo', true)
        .order('data_refeicao', { ascending: true })

      if (!error && data) {
        setCardapiosSemana(data as CardapioAlmoco[])
      } else {
        setCardapiosSemana([])
      }
    } catch {
      setCardapiosSemana([])
    } finally {
      setCarregandoCardapio(false)
    }
  }, [diasDaSemanaAtual])

  useEffect(() => {
    carregarCardapiosDaSemana()
  }, [carregarCardapiosDaSemana])

  const cardapioDoDia = useMemo(
    () => cardapiosSemana.find((c) => c.data_refeicao === dataSelecionada) || null,
    [cardapiosSemana, dataSelecionada]
  )

  useEffect(() => {
    async function carregarItensDoCardapio() {
      setEscolhasPorGrupo({})
      setQuantidade(1)
      setObservacoes('')

      if (!cardapioDoDia) {
        setItensCardapioAtual([])
        return
      }

      try {
        const { data, error } = await supabase
          .from('cardapio_almoco_itens')
          .select('*')
          .eq('cardapio_id', cardapioDoDia.id)
          .eq('ativo', true)
          .order('ordem', { ascending: true })

        if (!error && data) {
          const itens = data as ItemCardapioAlmoco[]
          setItensCardapioAtual(itens)

          const iniciais: Record<string, string[]> = {}
          const gruposVistos = new Set<string>()
          itens.forEach((item) => {
            if (item.obrigatorio && item.max_escolhas === 1 && !gruposVistos.has(item.grupo)) {
              iniciais[item.grupo] = [item.id]
              gruposVistos.add(item.grupo)
            }
          })
          setEscolhasPorGrupo(iniciais)
        } else {
          setItensCardapioAtual([])
        }
      } catch {
        setItensCardapioAtual([])
      }
    }

    carregarItensDoCardapio()
  }, [cardapioDoDia])

  const carregarMeusPedidos = useCallback(async () => {
    if (!userId && consumidores.length === 0) return

    try {
      const idsCarteiras = consumidores.filter((c) => c.usaCarteira).map((c) => c.id)

      let query = supabase
        .from('pedidos_almoco')
        .select('*')
        .order('data_refeicao', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10)

      if (idsCarteiras.length > 0 && userId) {
        query = query.or(`solicitante_id.eq.${userId},aluno_id.in.(${idsCarteiras.join(',')})`)
      } else if (userId) {
        query = query.eq('solicitante_id', userId)
      }

      const { data } = await query
      setMeusPedidos((data as PedidoAlmocoRow[]) || [])
    } catch {
      setMeusPedidos([])
    }
  }, [userId, consumidores])

  useEffect(() => {
    carregarMeusPedidos()
  }, [carregarMeusPedidos])

  const gruposDeOpcoes = useMemo(() => {
    const mapa = new Map<
      string,
      {
        grupo: string
        obrigatorio: boolean
        maxEscolhas: number
        itens: ItemCardapioAlmoco[]
      }
    >()

    itensCardapioAtual.forEach((item) => {
      const existente = mapa.get(item.grupo)
      if (!existente) {
        mapa.set(item.grupo, {
          grupo: item.grupo,
          obrigatorio: item.obrigatorio,
          maxEscolhas: Math.max(1, item.max_escolhas || 1),
          itens: [item],
        })
      } else {
        existente.itens.push(item)
        if (item.obrigatorio) existente.obrigatorio = true
        existente.maxEscolhas = Math.max(existente.maxEscolhas, item.max_escolhas || 1)
      }
    })

    return Array.from(mapa.values())
  }, [itensCardapioAtual])

  const handleToggleOpcao = (grupo: string, itemId: string, maxEscolhas: number) => {
    setEscolhasPorGrupo((prev) => {
      const atuais = prev[grupo] || []
      const jaMarcado = atuais.includes(itemId)

      if (maxEscolhas === 1) {
        return { ...prev, [grupo]: jaMarcado ? [] : [itemId] }
      }

      if (jaMarcado) {
        return { ...prev, [grupo]: atuais.filter((id) => id !== itemId) }
      }

      if (atuais.length >= maxEscolhas) {
        return { ...prev, [grupo]: [...atuais.slice(1), itemId] }
      }

      return { ...prev, [grupo]: [...atuais, itemId] }
    })
  }

  const itemConflitaComRestricao = (item: ItemCardapioAlmoco): boolean => {
    if (restricoesAluno.length === 0) return false
    const texto = `${item.nome} ${item.descricao || ''}`.toLowerCase()
    return restricoesAluno.some(
      (rest) => texto.includes(rest) || rest.includes(item.nome.toLowerCase())
    )
  }

  const itensEscolhidosDetalhados = useMemo<ItemEscolhidoSnapshot[]>(() => {
    const lista: ItemEscolhidoSnapshot[] = []
    Object.entries(escolhasPorGrupo).forEach(([grupo, ids]) => {
      ids.forEach((id) => {
        const encontrado = itensCardapioAtual.find((i) => i.id === id)
        if (encontrado) {
          lista.push({
            grupo,
            item_id: encontrado.id,
            nome: encontrado.nome,
            preco_adicional: Number(encontrado.preco_adicional || 0),
          })
        }
      })
    })
    return lista
  }, [escolhasPorGrupo, itensCardapioAtual])

  const valorUnitarioPrato = useMemo(() => {
    if (!cardapioDoDia) return 0
    const somaAdicionais = itensEscolhidosDetalhados.reduce(
      (acc, i) => acc + Number(i.preco_adicional || 0),
      0
    )
    return Number(cardapioDoDia.preco_base || 0) + somaAdicionais
  }, [cardapioDoDia, itensEscolhidosDetalhados])

  const valorTotalPedido = valorUnitarioPrato * quantidade

  const handleConfirmarPedidoAlmoco = async () => {
    if (!cardapioDoDia || !consumidorSelecionado) return

    if (consumidorSelecionado.cartaoBloqueado) {
      mostrarAviso('Carteira Bloqueada', 'O consumo desta carteira está bloqueado no momento.')
      return
    }

    for (const grp of gruposDeOpcoes) {
      const selecionados = escolhasPorGrupo[grp.grupo] || []
      if (grp.obrigatorio && selecionados.length === 0) {
        mostrarAviso('Opção Obrigatória', `Selecione pelo menos 1 opção em "${grp.grupo}".`)
        return
      }
    }

    if (valorTotalPedido <= 0) {
      mostrarAviso('Valor Inválido', 'O valor do prato não pode ser zero.')
      return
    }

    if (consumidorSelecionado.usaCarteira && consumidorSelecionado.saldo < valorTotalPedido) {
      mostrarAviso(
        'Saldo Insuficiente',
        `Saldo disponível: ${formatarMoeda(consumidorSelecionado.saldo)}. Faça uma recarga antes de confirmar o almoço.`
      )
      return
    }

    setEnviandoPedido(true)

    try {
      let carteiraId: string | null = null

      if (consumidorSelecionado.usaCarteira) {
        const { data: carteira } = await supabase
          .from('carteiras')
          .select('id, saldo')
          .eq('aluno_id', consumidorSelecionado.id)
          .maybeSingle()

        if (!carteira || Number(carteira.saldo) < valorTotalPedido) {
          throw new Error('Saldo insuficiente na carteira selecionada.')
        }

        carteiraId = String(carteira.id)
        const novoSaldo = Number(carteira.saldo) - valorTotalPedido

        const { error: errSaldo } = await supabase
          .from('carteiras')
          .update({ saldo: novoSaldo })
          .eq('id', carteira.id)

        if (errSaldo) throw errSaldo

        await supabase
          .from('alunos')
          .update({ saldo: novoSaldo })
          .eq('id', consumidorSelecionado.id)

        setConsumidores((prev) =>
          prev.map((c) => (c.id === consumidorSelecionado.id ? { ...c, saldo: novoSaldo } : c))
        )

        await supabase.from('extrato').insert([
          {
            carteira_id: carteira.id,
            aluno_id: consumidorSelecionado.id,
            tipo: 'debito',
            valor: valorTotalPedido,
            descricao: `Almoço (${dataSelecionada.split('-').reverse().join('/')}) - ${
              cardapioDoDia.titulo
            }`,
          },
        ])
      }

      const { error: errPedido } = await supabase.from('pedidos_almoco').insert([
        {
          escola_id: cardapioDoDia.escola_id || null,
          cardapio_id: cardapioDoDia.id,
          aluno_id: consumidorSelecionado.usaCarteira ? consumidorSelecionado.id : null,
          carteira_id: carteiraId,
          solicitante_id: userId || null,
          tipo_consumidor: consumidorSelecionado.tipo,
          nome_consumidor: consumidorSelecionado.nome,
          data_refeicao: dataSelecionada,
          quantidade,
          itens_escolhidos: itensEscolhidosDetalhados,
          observacoes: observacoes.trim() || null,
          valor_unitario: valorUnitarioPrato,
          valor_total: valorTotalPedido,
          status: 'confirmado',
        },
      ])

      if (errPedido) throw errPedido

      const resumoPrato = itensEscolhidosDetalhados.map((i) => i.nome).join(', ')
      await supabase.from('pedidos').insert([
        {
          aluno_id: consumidorSelecionado.usaCarteira ? consumidorSelecionado.id : null,
          valor_total: valorTotalPedido,
          status: 'pago',
          observacoes: `ALMOÇO (${dataSelecionada.split('-').reverse().join('/')}) - ${
            consumidorSelecionado.nome
          }: ${resumoPrato}${observacoes.trim() ? ` | Obs: ${observacoes.trim()}` : ''}`,
        },
      ])

      mostrarAviso(
        'Almoço Confirmado!',
        `Pedido de almoço para ${consumidorSelecionado.nome.split(' ')[0]} no dia ${dataSelecionada
          .split('-')
          .reverse()
          .join('/')} confirmado com sucesso!`
      )
      setObservacoes('')
      setQuantidade(1)
      await carregarMeusPedidos()
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Erro ao registrar pedido de almoço.')
    } finally {
      setEnviandoPedido(false)
    }
  }

  const handleCancelarPedido = async (pedido: PedidoAlmocoRow) => {
    if (pedido.status !== 'confirmado') return

    setCancelandoId(pedido.id)
    try {
      const { error } = await supabase
        .from('pedidos_almoco')
        .update({ status: 'cancelado' })
        .eq('id', pedido.id)

      if (error) throw error

      if (pedido.aluno_id) {
        const { data: carteira } = await supabase
          .from('carteiras')
          .select('id, saldo')
          .eq('aluno_id', pedido.aluno_id)
          .maybeSingle()

        if (carteira) {
          const saldoEstornado = Number(carteira.saldo || 0) + Number(pedido.valor_total || 0)
          await supabase
            .from('carteiras')
            .update({ saldo: saldoEstornado })
            .eq('id', carteira.id)

          await supabase.from('alunos').update({ saldo: saldoEstornado }).eq('id', pedido.aluno_id)

          await supabase.from('extrato').insert([
            {
              carteira_id: carteira.id,
              aluno_id: pedido.aluno_id,
              tipo: 'credito',
              valor: Number(pedido.valor_total || 0),
              descricao: `Estorno Almoço Cancelado (${pedido.data_refeicao
                .split('-')
                .reverse()
                .join('/')})`,
            },
          ])

          setConsumidores((prev) =>
            prev.map((c) => (c.id === pedido.aluno_id ? { ...c, saldo: saldoEstornado } : c))
          )
        }
      }

      mostrarAviso('Cancelado', 'Pedido de almoço cancelado e valor estornado para a carteira.')
      await carregarMeusPedidos()
    } catch {
      mostrarAviso('Erro', 'Não foi possível cancelar este pedido no momento.')
    } finally {
      setCancelandoId(null)
    }
  }

  const onRefresh = () => {
    setRefreshing(true)
    carregarConsumidores()
    carregarCardapiosDaSemana()
    carregarMeusPedidos()
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Cabeçalho Institucional */}
      <View
        style={[
          styles.topHeader,
          { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 20 : 40) + 6 },
        ]}
      >
        <View style={styles.topAccentCircle} />
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>REFEIÇÕES & ALMOÇO ESCOLAR</Text>
        </View>
        <Text style={styles.title}>Cardápio Semanal & Montagem</Text>
        <Text style={styles.subtitle}>
          Escolha o dia da semana, monte o prato com as opções da cozinha e agende o almoço.
        </Text>
      </View>

      {/* Corpo Branco Arredondado */}
      <ScrollView
        style={styles.bodySheet}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E62D0']} />
        }
      >
        {carregandoInicial ? (
          <ActivityIndicator size="large" color="#1E62D0" style={{ marginVertical: 48 }} />
        ) : (
          <>
            {/* 1. QUEM VAI ALMOÇAR */}
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <Text style={styles.stepLabel}>1. QUEM VAI ALMOÇAR?</Text>
                {!temCarteiraPessoal && (
                  <TouchableOpacity
                    style={styles.personalWalletBtn}
                    onPress={handleAtivarCarteiraPessoal}
                    disabled={ativandoCarteiraPessoal}
                  >
                    {ativandoCarteiraPessoal ? (
                      <ActivityIndicator size="small" color="#1E62D0" />
                    ) : (
                      <>
                        <Ionicons name="wallet-outline" size={13} color="#1E62D0" />
                        <Text style={styles.personalWalletBtnText}>+ Minha Carteira</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {consumidores.map((cons) => {
                  const isSel = cons.id === consumidorSelecionadoId
                  return (
                    <TouchableOpacity
                      key={cons.id}
                      style={[styles.consumerChip, isSel && styles.consumerChipSel]}
                      onPress={() => setConsumidorSelecionadoId(cons.id)}
                      activeOpacity={0.85}
                    >
                      <View
                        style={[styles.consumerAvatar, isSel && styles.consumerAvatarSel]}
                      >
                        <Text
                          style={[
                            styles.consumerAvatarText,
                            isSel && styles.consumerAvatarTextSel,
                          ]}
                        >
                          {cons.nome.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text
                          style={[styles.consumerName, isSel && styles.consumerNameSel]}
                          numberOfLines={1}
                        >
                          {cons.nome.split(' ')[0]}
                        </Text>
                        <Text style={[styles.consumerSaldo, isSel && styles.consumerSaldoSel]}>
                          {cons.usaCarteira ? formatarMoeda(cons.saldo) : cons.subtitulo}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {consumidorSelecionado &&
                consumidorSelecionado.usaCarteira &&
                consumidorSelecionado.saldo <= 0 && (
                  <View style={styles.saldoZeroBox}>
                    <Text style={styles.saldoZeroText}>
                      Carteira com saldo R$ 0,00. Adicione créditos via PIX.
                    </Text>
                    <TouchableOpacity
                      style={styles.saldoZeroBtn}
                      onPress={() => router.push('/(tabs)/recarregar' as any)}
                    >
                      <Text style={styles.saldoZeroBtnText}>RECARREGAR</Text>
                    </TouchableOpacity>
                  </View>
                )}
            </View>

            {/* 2. SELETOR DE DIA DA SEMANA */}
            <View style={styles.card}>
              <View style={styles.cardHeaderBetween}>
                <Text style={styles.stepLabel}>2. SELECIONE O DIA DA SEMANA</Text>
                <View style={styles.weekNavRow}>
                  <TouchableOpacity
                    style={[styles.weekNavBtn, offsetSemana === 0 && { opacity: 0.4 }]}
                    disabled={offsetSemana === 0}
                    onPress={() => setOffsetSemana((s) => Math.max(0, s - 1))}
                  >
                    <Ionicons name="chevron-back" size={16} color="#334155" />
                  </TouchableOpacity>
                  <Text style={styles.weekLabel}>
                    {offsetSemana === 0 ? 'Esta Semana' : 'Próxima Semana'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.weekNavBtn, offsetSemana === 1 && { opacity: 0.4 }]}
                    disabled={offsetSemana === 1}
                    onPress={() => setOffsetSemana((s) => Math.min(1, s + 1))}
                  >
                    <Ionicons name="chevron-forward" size={16} color="#334155" />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {diasDaSemanaAtual.map((dia) => {
                  const ativo = dia.dataISO === dataSelecionada
                  const temCardapio = cardapiosSemana.some((c) => c.data_refeicao === dia.dataISO)

                  return (
                    <TouchableOpacity
                      key={dia.dataISO}
                      style={[styles.dayCard, ativo && styles.dayCardActive]}
                      onPress={() => setDataSelecionada(dia.dataISO)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.dayCurto, ativo && { color: '#BFDBFE' }]}>
                        {dia.curto}
                      </Text>
                      <Text style={[styles.dayMes, ativo && { color: '#FFFFFF' }]}>
                        {dia.diaMes}
                      </Text>
                      <View
                        style={[
                          styles.dayStatusBadge,
                          temCardapio
                            ? ativo
                              ? { backgroundColor: 'rgba(255,255,255,0.2)' }
                              : { backgroundColor: '#DCFCE7' }
                            : ativo
                            ? { backgroundColor: 'rgba(255,255,255,0.1)' }
                            : { backgroundColor: '#E2E8F0' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayStatusText,
                            temCardapio
                              ? ativo
                                ? { color: '#FFFFFF' }
                                : { color: '#15803D' }
                              : ativo
                              ? { color: '#CBD5E1' }
                              : { color: '#64748B' },
                          ]}
                        >
                          {temCardapio ? 'Disponível' : 'Sem menu'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>

            {/* 3. MONTAGEM DO PRATO */}
            {carregandoCardapio ? (
              <ActivityIndicator size="large" color="#1E62D0" style={{ marginVertical: 32 }} />
            ) : !cardapioDoDia ? (
              <View style={styles.emptyCard}>
                <Ionicons name="restaurant-outline" size={38} color="#94A3B8" />
                <Text style={styles.emptyTitle}>
                  Cardápio ainda não publicado para este dia
                </Text>
                <Text style={styles.emptySub}>
                  Selecione outro dia da semana acima ou aguarde a cantina liberar o cardápio.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.menuBanner}>
                  <Text style={styles.menuBannerTag}>
                    CARDÁPIO • {dataSelecionada.split('-').reverse().join('/')}
                  </Text>
                  <Text style={styles.menuBannerTitle}>{cardapioDoDia.titulo}</Text>
                  {cardapioDoDia.descricao ? (
                    <Text style={styles.menuBannerDesc}>{cardapioDoDia.descricao}</Text>
                  ) : null}
                  <View style={styles.menuBannerPriceRow}>
                    <Text style={styles.menuBannerPrice}>
                      Base: {formatarMoeda(Number(cardapioDoDia.preco_base || 0))}
                    </Text>
                    {cardapioDoDia.horario_limite ? (
                      <Text style={styles.menuBannerLimit}>
                        Até {cardapioDoDia.horario_limite.slice(0, 5)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {gruposDeOpcoes.map((grp) => {
                  const escolhidosNoGrupo = escolhasPorGrupo[grp.grupo] || []
                  return (
                    <View key={grp.grupo} style={styles.card}>
                      <View style={styles.cardHeaderBetween}>
                        <View>
                          <Text style={styles.groupTitle}>{grp.grupo}</Text>
                          <Text style={styles.groupSub}>
                            {grp.maxEscolhas === 1
                              ? 'Escolha 1 opção'
                              : `Escolha até ${grp.maxEscolhas} opções`}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.reqBadge,
                            grp.obrigatorio
                              ? escolhidosNoGrupo.length > 0
                                ? { backgroundColor: '#DCFCE7' }
                                : { backgroundColor: '#FEF3C7' }
                              : { backgroundColor: '#F1F5F9' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.reqBadgeText,
                              grp.obrigatorio
                                ? escolhidosNoGrupo.length > 0
                                  ? { color: '#15803D' }
                                  : { color: '#92400E' }
                                : { color: '#475569' },
                            ]}
                          >
                            {grp.obrigatorio ? 'OBRIGATÓRIO' : 'OPCIONAL'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ gap: 8 }}>
                        {grp.itens.map((item) => {
                          const marcado = escolhidosNoGrupo.includes(item.id)
                          const conflitoSaude = itemConflitaComRestricao(item)

                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.optionRow,
                                marcado && styles.optionRowSelected,
                                conflitoSaude && styles.optionRowWarning,
                              ]}
                              onPress={() => handleToggleOpcao(grp.grupo, item.id, grp.maxEscolhas)}
                              activeOpacity={0.85}
                            >
                              <View style={{ flex: 1, paddingRight: 10 }}>
                                <Text style={styles.optionName}>{item.nome}</Text>
                                {item.descricao ? (
                                  <Text style={styles.optionDesc}>{item.descricao}</Text>
                                ) : null}
                                {conflitoSaude && (
                                  <Text style={styles.optionWarningText}>
                                    Atenção: Restrição Alimentar
                                  </Text>
                                )}
                                {Number(item.preco_adicional) > 0 && (
                                  <Text style={styles.optionExtraPrice}>
                                    + {formatarMoeda(Number(item.preco_adicional))}
                                  </Text>
                                )}
                              </View>

                              <View
                                style={[
                                  styles.checkbox,
                                  marcado && styles.checkboxChecked,
                                ]}
                              >
                                {marcado && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                              </View>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )
                })}

                {/* RESUMO DO ALMOÇO */}
                <View style={styles.card}>
                  <Text style={styles.stepLabel}>RESUMO DO ALMOÇO</Text>

                  <View style={styles.qtyRow}>
                    <Text style={styles.qtyLabel}>Quantidade de Pratos</Text>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => setQuantidade((q) => Math.max(1, q - 1))}
                      >
                        <Ionicons name="remove" size={16} color="#1E293B" />
                      </TouchableOpacity>
                      <Text style={styles.qtyValue}>{quantidade}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => setQuantidade((q) => Math.min(10, q + 1))}
                      >
                        <Ionicons name="add" size={16} color="#1E293B" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TextInput
                    style={styles.obsInput}
                    placeholder="Observações para a cozinha (Ex: Sem cebola)..."
                    placeholderTextColor="#94A3B8"
                    value={observacoes}
                    onChangeText={setObservacoes}
                  />

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>TOTAL DO PEDIDO</Text>
                    <Text style={styles.totalValue}>{formatarMoeda(valorTotalPedido)}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.confirmBtn, enviandoPedido && { opacity: 0.6 }]}
                    onPress={handleConfirmarPedidoAlmoco}
                    disabled={enviandoPedido}
                    activeOpacity={0.85}
                  >
                    {enviandoPedido ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                        <Text style={styles.confirmBtnText}>CONFIRMAR ALMOÇO</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* 4. PEDIDOS DE ALMOÇO REALIZADOS */}
            <View style={styles.card}>
              <Text style={styles.stepLabel}>PEDIDOS DE ALMOÇO REALIZADOS</Text>
              {meusPedidos.length === 0 ? (
                <Text style={styles.emptyHistoryText}>
                  Nenhum pedido de almoço registrado até o momento.
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {meusPedidos.map((ped) => {
                    const cancelado = ped.status === 'cancelado'
                    return (
                      <View
                        key={ped.id}
                        style={[styles.orderCard, cancelado && { opacity: 0.6 }]}
                      >
                        <View style={styles.cardHeaderBetween}>
                          <Text style={styles.orderDate}>
                            {ped.data_refeicao.split('-').reverse().join('/')} •{' '}
                            {ped.nome_consumidor.split(' ')[0]} ({ped.quantidade}x)
                          </Text>
                          <Text style={styles.orderStatus}>
                            {ped.status.toUpperCase()}
                          </Text>
                        </View>

                        <Text style={styles.orderItems}>
                          {Array.isArray(ped.itens_escolhidos) && ped.itens_escolhidos.length > 0
                            ? ped.itens_escolhidos.map((i) => i.nome).join(' • ')
                            : 'Refeição padrão'}
                        </Text>

                        <View style={[styles.cardHeaderBetween, { marginTop: 8 }]}>
                          <Text style={styles.orderPrice}>
                            {formatarMoeda(Number(ped.valor_total || 0))}
                          </Text>
                          {ped.status === 'confirmado' && (
                            <TouchableOpacity
                              style={styles.cancelOrderBtn}
                              disabled={cancelandoId === ped.id}
                              onPress={() => handleCancelarPedido(ped)}
                            >
                              {cancelandoId === ped.id ? (
                                <ActivityIndicator size="small" color="#E11D48" />
                              ) : (
                                <Text style={styles.cancelOrderBtnText}>CANCELAR</Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1E2B58' },
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
  headerBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  title: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { fontSize: 12, color: '#CBD5E1', marginTop: 2 },
  bodySheet: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  cardHeaderBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.6 },
  personalWalletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  personalWalletBtnText: { fontSize: 10, fontWeight: '800', color: '#1E62D0' },
  consumerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 10,
    minWidth: 140,
  },
  consumerChipSel: { backgroundColor: '#1E62D0', borderColor: '#1E62D0' },
  consumerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  consumerAvatarSel: { backgroundColor: 'rgba(255,255,255,0.22)' },
  consumerAvatarText: { fontSize: 14, fontWeight: '800', color: '#334155' },
  consumerAvatarTextSel: { color: '#FFFFFF' },
  consumerName: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  consumerNameSel: { color: '#FFFFFF' },
  consumerSaldo: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  consumerSaldoSel: { color: '#DBEAFE' },
  saldoZeroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  saldoZeroText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#92400E' },
  saldoZeroBtn: {
    backgroundColor: '#F27835',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  saldoZeroBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  weekNavRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekNavBtn: {
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  weekLabel: { fontSize: 11, fontWeight: '800', color: '#334155' },
  dayCard: {
    width: 84,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  dayCardActive: { backgroundColor: '#1E62D0', borderColor: '#1E62D0' },
  dayCurto: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  dayMes: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginTop: 2 },
  dayStatusBadge: {
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  dayStatusText: { fontSize: 8, fontWeight: '800' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginTop: 10 },
  emptySub: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 },
  menuBanner: {
    backgroundColor: '#1E62D0',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  menuBannerTag: { fontSize: 10, fontWeight: '800', color: '#BFDBFE', letterSpacing: 0.7 },
  menuBannerTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', marginTop: 4 },
  menuBannerDesc: { fontSize: 12, color: '#DBEAFE', marginTop: 4 },
  menuBannerPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  menuBannerPrice: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  menuBannerLimit: { fontSize: 11, fontWeight: '700', color: '#DBEAFE' },
  groupTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  groupSub: { fontSize: 11, color: '#64748B' },
  reqBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  reqBadgeText: { fontSize: 9, fontWeight: '900' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  optionRowSelected: { borderColor: '#1E62D0', backgroundColor: '#EFF6FF' },
  optionRowWarning: { borderColor: '#FDA4AF', backgroundColor: '#FFF1F2' },
  optionName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  optionDesc: { fontSize: 11, color: '#64748B', marginTop: 2 },
  optionWarningText: { fontSize: 10, fontWeight: '800', color: '#BE123C', marginTop: 3 },
  optionExtraPrice: { fontSize: 11, fontWeight: '800', color: '#1E62D0', marginTop: 3 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#1E62D0', borderColor: '#1E62D0' },
  qtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  qtyLabel: { fontSize: 12, fontWeight: '800', color: '#334155' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyValue: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  obsInput: {
    height: 44,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 12,
    color: '#0F172A',
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 14,
  },
  totalLabel: { fontSize: 12, fontWeight: '900', color: '#1E293B' },
  totalValue: { fontSize: 20, fontWeight: '900', color: '#1E62D0' },
  confirmBtn: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#F27835',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  confirmBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  emptyHistoryText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', paddingVertical: 12 },
  orderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderDate: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  orderStatus: { fontSize: 10, fontWeight: '900', color: '#B45309' },
  orderItems: { fontSize: 12, color: '#475569', marginTop: 4 },
  orderPrice: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  cancelOrderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  cancelOrderBtnText: { fontSize: 10, fontWeight: '800', color: '#E11D48' },
})