import React, { useEffect, useState } from 'react'
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
} from 'react-native'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

interface Categoria {
  id: string
  nome: string
}

interface Produto {
  id: string
  nome: string
  descricao?: string
  preco: number
  categoria_id?: string
  foto_url?: string
  estoque: number
}

interface ItemCarrinho {
  produto: Produto
  quantidade: number
}

interface Dependente {
  id: string
  nome: string
  saldo: number
  escola_id?: string
}

export default function PedidosScreen() {
  const router = useRouter()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Todos')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  // Estado do Carrinho
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [modalCheckoutVisible, setModalCheckoutVisible] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState<'carteira' | 'pix' | 'credito' | 'debito'>('carteira')

  // Alunos e Saldo
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [processandoPagamento, setProcessandoPagamento] = useState(false)

  // Modais de Alerta e Sucesso
  const [sucessoModal, setSucessoModal] = useState(false)
  const [modalSaldoInsuficiente, setModalSaldoInsuficiente] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)

      // 1. Busca Categorias
      try {
        const { data: catData } = await supabase
          .from('categorias')
          .select('*')
          .order('nome', { ascending: true })

        if (catData) setCategorias(catData)
      } catch (e) {
        console.log('Erro ao buscar categorias:', e)
      }

      // 2. Busca Produtos com Realtime
      try {
        const { data: prodData } = await supabase
          .from('produtos')
          .select('*')
          .order('nome', { ascending: true })

        if (prodData) {
          const formatados: Produto[] = prodData.map((p: any) => ({
            id: String(p.id),
            nome: p.nome || 'Produto',
            descricao: p.descricao || '',
            preco: Number(p.preco ?? p.valor ?? 0),
            categoria_id: p.categoria_id ? String(p.categoria_id) : undefined,
            foto_url: p.foto_url || p.imagem || null,
            estoque: p.estoque !== undefined && p.estoque !== null ? Number(p.estoque) : (p.esgotado ? 0 : 10),
          }))
          setProdutos(formatados)
        }
      } catch (e) {
        console.log('Erro ao buscar produtos:', e)
      }

      // 3. Busca Alunos e Saldo das Carteiras em Tempo Real
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        let alunosLista: any[] = []

        const { data: diretos } = await supabase
          .from('alunos')
          .select('*')
          .eq('responsavel_id', user.id)

        if (diretos && diretos.length > 0) {
          alunosLista = diretos
        } else {
          const { data: vinculos } = await supabase
            .from('responsaveis_alunos')
            .select('aluno_id')
            .eq('responsavel_id', user.id)

          if (vinculos && vinculos.length > 0) {
            const ids = vinculos.map((v: any) => v.aluno_id)
            const { data: porIds } = await supabase
              .from('alunos')
              .select('*')
              .in('id', ids)

            if (porIds) alunosLista = porIds
          }
        }

        if (alunosLista.length > 0) {
          const alunoIds = alunosLista.map((a: any) => a.id)

          let carteirasMap: Record<string, number> = {}
          try {
            const { data: carteirasData } = await supabase
              .from('carteiras')
              .select('*')
              .in('aluno_id', alunoIds)

            if (carteirasData) {
              carteirasData.forEach((c: any) => {
                const valSaldo = Number(c.saldo ?? c.saldo_dinheiro ?? c.saldo_atual ?? c.valor ?? 0)
                carteirasMap[String(c.aluno_id)] = valSaldo
              })
            }
          } catch (e) {
            console.log('Erro ao consultar carteiras:', e)
          }

          const list: Dependente[] = alunosLista.map((a: any) => {
            const aid = String(a.id)
            const valCarteira = carteirasMap[aid]
            const saldoFinal = valCarteira !== undefined ? valCarteira : Number(a.saldo ?? a.saldo_atual ?? 0)

            return {
              id: aid,
              nome: a.nome || 'Aluno',
              saldo: saldoFinal,
              escola_id: a.escola_id,
            }
          })

          setDependentes(list)
          if (!alunoSelecionado) setAlunoSelecionado(list[0])
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados da cantina:', err)
    } finally {
      setLoading(false)
    }
  }

  // Escutar alterações de Saldo em Tempo Real
  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('carteiras_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carteiras' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleAdicionarItem = (produto: Produto) => {
    if (produto.estoque <= 0) return

    setCarrinho((prev) => {
      const existe = prev.find((i) => i.produto.id === produto.id)
      if (existe) {
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

  // Lógica de Filtragem por Busca e Categoria Corrigida
  const produtosFiltrados = produtos.filter((p) => {
    const combinaBusca =
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (p.descricao && p.descricao.toLowerCase().includes(busca.toLowerCase()))

    if (categoriaAtiva === 'Todos') return combinaBusca

    // Encontra a categoria correspondente pelo nome na lista vinda do banco
    const catObjeto = categorias.find((c) => c.nome.toLowerCase() === categoriaAtiva.toLowerCase())

    const combinaCategoria = p.categoria_id
      ? String(p.categoria_id) === String(catObjeto?.id)
      : (p as any).categoria?.toLowerCase() === categoriaAtiva.toLowerCase()

    return combinaBusca && combinaCategoria
  })

  // Finalizar e Enviar em Tempo Real para o Portal Admin
  const handleFinalizarPagamento = async () => {
    if (carrinho.length === 0) return

    if (!alunoSelecionado) {
      const msg = 'Por favor, selecione um aluno para quem é o pedido.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Atenção', msg)
      return
    }

    if (formaPagamento === 'carteira' && alunoSelecionado.saldo < valorTotalCarrinho) {
      setModalSaldoInsuficiente(true)
      return
    }

    setProcessandoPagamento(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 1. Criar pedido na tabela 'pedidos'
      const { data: pedidoCriado, error: pErr } = await supabase
        .from('pedidos')
        .insert({
          aluno_id: alunoSelecionado.id,
          responsavel_id: user?.id,
          valor_total: valorTotalCarrinho,
          total: valorTotalCarrinho,
          valor: valorTotalCarrinho,
          status: 'concluido',
          forma_pagamento: formaPagamento,
          tipo_pagamento: formaPagamento,
          escola_id: alunoSelecionado.escola_id,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (pErr) console.log('Log de criação do pedido:', pErr)

      const pedidoId = pedidoCriado?.id

      // 2. Criar itens do pedido
      if (pedidoId) {
        const itensPayload = carrinho.map((item) => ({
          pedido_id: pedidoId,
          produto_id: item.produto.id,
          quantidade: item.quantidade,
          preco_unitario: item.produto.preco,
        }))

        await supabase.from('itens_pedido').insert(itensPayload)
      }

      // 3. Registrar Transação no Extrato Geral
      try {
        await supabase.from('transacoes').insert({
          aluno_id: alunoSelecionado.id,
          valor: valorTotalCarrinho,
          tipo: 'saida',
          descricao: `Compra Cantina - ${quantidadeTotal} item(ns)`,
          created_at: new Date().toISOString(),
        })
      } catch (eTrans) {
        console.log('Log transação:', eTrans)
      }

      // 4. Debitar Saldo em 'carteiras' e 'alunos' em Tempo Real
      if (formaPagamento === 'carteira') {
        const novoSaldo = Math.max(0, alunoSelecionado.saldo - valorTotalCarrinho)

        await supabase
          .from('carteiras')
          .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
          .eq('aluno_id', alunoSelecionado.id)

        await supabase
          .from('alunos')
          .update({ saldo: novoSaldo })
          .eq('id', alunoSelecionado.id)
      }

      setModalCheckoutVisible(false)
      setSucessoModal(true)
      setCarrinho([])
      fetchData()
    } catch (err: any) {
      const msg = err.message || 'Erro ao registrar compra.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Erro', msg)
    } finally {
      setProcessandoPagamento(false)
    }
  }

  const handleIrParaRecarga = () => {
    setModalSaldoInsuficiente(false)
    setModalCheckoutVisible(false)
    router.push('/(tabs)/recarregar' as any)
  }

  // Lista de Nomes de Categorias Dinâmica + 'Todos'
  const listaNomesCategorias = ['Todos', ...Array.from(new Set(categorias.map((c) => c.nome)))]

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.title}>Cardápio da Cantina</Text>
          <Text style={styles.subtitle}>Escolha os produtos e faça pedidos para os alunos</Text>

          <View style={styles.searchWrapper}>
            <Ionicons name="search-outline" size={18} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar salgados, bebidas, doces..."
              placeholderTextColor="#94A3B8"
              value={busca}
              onChangeText={setBusca}
            />
          </View>
        </View>

        {/* Categorias Dinâmicas */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScrollView}>
          {listaNomesCategorias.map((cat) => {
            const isSelected = categoriaAtiva.toLowerCase() === cat.toLowerCase()
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, isSelected && styles.catChipSelected]}
                onPress={() => setCategoriaAtiva(cat)}
              >
                <Text style={[styles.catChipText, isSelected && styles.catChipTextSelected]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Lista de Produtos */}
        {loading ? (
          <ActivityIndicator size="large" color="#2B6CB0" style={{ marginVertical: 40 }} />
        ) : produtosFiltrados.length > 0 ? (
          <View style={styles.productList}>
            {produtosFiltrados.map((item) => {
              const noCarrinho = carrinho.find((i) => i.produto.id === item.id)
              const quantidade = noCarrinho?.quantidade || 0
              const isEsgotado = item.estoque <= 0

              return (
                <View
                  key={item.id}
                  style={[styles.productCard, isEsgotado && styles.productCardEsgotado]}
                >
                  <View style={styles.productInfo}>
                    <View style={styles.productHeaderRow}>
                      <Text style={[styles.productName, isEsgotado && styles.productNameEsgotado]}>
                        {item.nome}
                      </Text>
                      {isEsgotado && (
                        <View style={styles.badgeEsgotado}>
                          <Text style={styles.badgeEsgotadoText}>ESGOTADO</Text>
                        </View>
                      )}
                    </View>

                    {item.descricao ? (
                      <Text style={[styles.productDesc, isEsgotado && styles.productDescEsgotado]} numberOfLines={2}>
                        {item.descricao}
                      </Text>
                    ) : null}

                    <Text style={[styles.productPrice, isEsgotado && styles.productPriceEsgotado]}>
                      R$ {item.preco.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>

                  {/* Controle do Botão */}
                  {isEsgotado ? (
                    <View style={styles.btnIndisponivel}>
                      <Text style={styles.btnIndisponivelText}>Indisponível</Text>
                    </View>
                  ) : quantidade > 0 ? (
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => handleRemoverItem(item.id)}
                      >
                        <Ionicons name="remove" size={16} color="#2563EB" />
                      </TouchableOpacity>

                      <Text style={styles.qtyText}>{quantidade}</Text>

                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => handleAdicionarItem(item)}
                      >
                        <Ionicons name="add" size={16} color="#2563EB" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addCtaBtn}
                      onPress={() => handleAdicionarItem(item)}
                      activeOpacity={0.88}
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
            <Ionicons name="fast-food-outline" size={40} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Nenhum produto encontrado nesta categoria</Text>
          </View>
        )}
      </ScrollView>

      {/* BARRA FLUTUANTE DO CARRINHO */}
      {carrinho.length > 0 && (
        <View style={styles.floatingCartBar}>
          <View>
            <Text style={styles.cartBarCount}>
              {quantidadeTotal} {quantidadeTotal === 1 ? 'item' : 'itens'} no carrinho
            </Text>
            <Text style={styles.cartBarTotal}>
              Total: R$ {valorTotalCarrinho.toFixed(2).replace('.', ',')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.cartCheckoutBtn}
            onPress={() => setModalCheckoutVisible(true)}
            activeOpacity={0.88}
          >
            <Ionicons name="cart-outline" size={18} color="#FFFFFF" />
            <Text style={styles.cartCheckoutBtnText}>VER CARRINHO / PAGAR</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL 1: CHECKOUT */}
      <Modal visible={modalCheckoutVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Resumo do Pedido</Text>
              <TouchableOpacity onPress={() => setModalCheckoutVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {dependentes.length > 0 && (
              <View style={styles.alunoSelectBox}>
                <Text style={styles.modalSectionLabel}>COMPRAR PARA QUAL ALUNO?</Text>
                <View style={styles.alunoChipRow}>
                  {dependentes.map((dep) => {
                    const isSel = alunoSelecionado?.id === dep.id
                    return (
                      <TouchableOpacity
                        key={dep.id}
                        style={[styles.alunoChip, isSel && styles.alunoChipSel]}
                        onPress={() => setAlunoSelecionado(dep)}
                      >
                        <Text style={[styles.alunoChipText, isSel && styles.alunoChipTextSel]}>
                          {dep.nome.split(' ')[0]} (R$ {dep.saldo.toFixed(2).replace('.', ',')})
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}

            <Text style={styles.modalSectionLabel}>ITENS SELECIONADOS</Text>
            <ScrollView style={{ maxHeight: 140, marginBottom: 12 }}>
              {carrinho.map((item) => (
                <View key={item.produto.id} style={styles.cartItemRow}>
                  <Text style={styles.cartItemName}>
                    <Text style={{ fontWeight: '800', color: '#2563EB' }}>
                      {item.quantidade}x{' '}
                    </Text>
                    {item.produto.nome}
                  </Text>
                  <Text style={styles.cartItemPrice}>
                    R$ {(item.produto.preco * item.quantidade).toFixed(2).replace('.', ',')}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.totalBoxRow}>
              <Text style={styles.totalBoxLabel}>VALOR TOTAL A PAGAR</Text>
              <Text style={styles.totalBoxValue}>
                R$ {valorTotalCarrinho.toFixed(2).replace('.', ',')}
              </Text>
            </View>

            <Text style={styles.modalSectionLabel}>FORMA DE PAGAMENTO</Text>

            <TouchableOpacity
              style={[
                styles.paymentOptionCard,
                formaPagamento === 'carteira' && styles.paymentOptionCardSel,
              ]}
              onPress={() => setFormaPagamento('carteira')}
            >
              <Ionicons name="wallet-outline" size={20} color="#2563EB" />
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentOptionTitle}>Saldo em Carteira c/ Facial ou Senha</Text>
                <Text style={styles.paymentOptionSub}>
                  Saldo de {alunoSelecionado?.nome.split(' ')[0]}: R${' '}
                  {alunoSelecionado?.saldo.toFixed(2).replace('.', ',')}
                </Text>
              </View>
              {formaPagamento === 'carteira' && (
                <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paymentOptionCard,
                formaPagamento === 'pix' && styles.paymentOptionCardSel,
              ]}
              onPress={() => setFormaPagamento('pix')}
            >
              <Ionicons name="flash-outline" size={20} color="#16A34A" />
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentOptionTitle}>PIX Instantâneo</Text>
                <Text style={styles.paymentOptionSub}>QR Code com aprovação na hora</Text>
              </View>
              {formaPagamento === 'pix' && (
                <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paymentOptionCard,
                (formaPagamento === 'credito' || formaPagamento === 'debito') &&
                  styles.paymentOptionCardSel,
              ]}
              onPress={() => setFormaPagamento('credito')}
            >
              <Ionicons name="card-outline" size={20} color="#9333EA" />
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentOptionTitle}>Cartão de Crédito ou Débito</Text>
                <Text style={styles.paymentOptionSub}>Pagamento online via cartão cadastrado</Text>
              </View>
              {(formaPagamento === 'credito' || formaPagamento === 'debito') && (
                <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payConfirmBtn, processandoPagamento && styles.payConfirmBtnDisabled]}
              onPress={handleFinalizarPagamento}
              disabled={processandoPagamento}
            >
              {processandoPagamento ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.payConfirmBtnText}>CONFIRMAR E PAGAR</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: AVISO SALDO INSUFICIENTE */}
      <Modal visible={modalSaldoInsuficiente} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center', paddingVertical: 28 }]}>
            <View style={styles.warningIconBadge}>
              <Ionicons name="warning-outline" size={36} color="#EA580C" />
            </View>

            <Text style={styles.warningTitle}>Saldo Insuficiente!</Text>
            <Text style={styles.warningSub}>
              A carteira de <Text style={{ fontWeight: '800', color: '#0F172A' }}>{alunoSelecionado?.nome}</Text> possui{' '}
              <Text style={{ fontWeight: '800', color: '#E11D48' }}>
                R$ {alunoSelecionado?.saldo.toFixed(2).replace('.', ',')}
              </Text>
              , mas o valor da compra é de{' '}
              <Text style={{ fontWeight: '800', color: '#16A34A' }}>
                R$ {valorTotalCarrinho.toFixed(2).replace('.', ',')}
              </Text>
              .
            </Text>

            <Text style={styles.rechargeQuestion}>Deseja realizar uma recarga de saldo agora?</Text>

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
                activeOpacity={0.88}
              >
                <Ionicons name="flash" size={16} color="#FFFFFF" />
                <Text style={styles.rechargeWarningText}>FAZER RECARGA</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: SUCESSO */}
      <Modal visible={sucessoModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center', paddingVertical: 32 }]}>
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            <Text style={styles.successTitle}>Pedido Pago com Sucesso!</Text>
            <Text style={styles.successSub}>
              O pedido foi enviado para a cantina escolar e estará disponível no Portal ADMIN instantaneamente.
            </Text>

            <TouchableOpacity
              style={styles.successCloseBtn}
              onPress={() => setSucessoModal(false)}
            >
              <Text style={styles.successCloseBtnText}>VOLTAR À CANTINA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 24 : 48,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 46,
    marginTop: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  catScrollView: {
    marginBottom: 16,
  },
  catChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  catChipSelected: {
    backgroundColor: '#2B6CB0',
    borderColor: '#2B6CB0',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productCardEsgotado: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.8,
  },
  productInfo: {
    flex: 1,
    paddingRight: 12,
  },
  productHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  productNameEsgotado: {
    color: '#94A3B8',
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
    letterSpacing: 0.5,
  },
  productDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  productDescEsgotado: {
    color: '#CBD5E1',
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '900',
    color: '#16A34A',
    marginTop: 6,
  },
  productPriceEsgotado: {
    color: '#94A3B8',
  },
  btnIndisponivel: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnIndisponivelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  addCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
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
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 8,
  },
  qtyBtn: {
    padding: 4,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  emptyBox: {
    alignItems: 'center',
    marginVertical: 40,
  },
  emptyTitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
  },
  floatingCartBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  cartBarCount: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  cartBarTotal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 1,
  },
  cartCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F27835',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  cartCheckoutBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  /* Modais */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  alunoSelectBox: {
    marginBottom: 12,
  },
  alunoChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  alunoChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alunoChipSel: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  alunoChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },
  alunoChipTextSel: {
    color: '#2563EB',
    fontWeight: '800',
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cartItemName: {
    fontSize: 12,
    color: '#334155',
  },
  cartItemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  totalBoxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  totalBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  totalBoxValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#16A34A',
  },
  paymentOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  paymentOptionCardSel: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  paymentOptionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  paymentOptionSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  payConfirmBtn: {
    height: 48,
    backgroundColor: '#1E62D0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  payConfirmBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  payConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  /* Aviso Saldo Insuficiente */
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
    color: '#EA580C',
  },
  warningSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    paddingHorizontal: 12,
  },
  rechargeQuestion: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 16,
  },
  warningActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelWarningBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelWarningText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  rechargeWarningBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F27835',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  rechargeWarningText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  /* Sucesso */
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
  },
  successSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    paddingHorizontal: 20,
  },
  successCloseBtn: {
    backgroundColor: '#2B6CB0',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  successCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
})