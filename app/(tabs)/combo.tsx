import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  RefreshControl,
  StatusBar,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface Aluno {
  id: string
  carteira_id?: string
  nome: string
  turma?: string
  saldo: number
  bloqueado: boolean
}

interface Combo {
  id: string
  nome: string
  descricao: string
  preco: number
  disponivel: boolean
}

export default function ComboScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [combos, setCombos] = useState<Combo[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [comboSelecionado, setComboSelecionado] = useState<Combo | null>(null)
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null)
  const [quandoRetirar, setQuandoRetirar] = useState<'hoje' | 'amanha'>('hoje')
  const [modalVisible, setModalVisible] = useState(false)
  const [comprando, setComprando] = useState(false)

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  const fetchData = useCallback(async () => {
    try {
      const { data: combosData } = await supabase
        .from('combos')
        .select('*')
        .eq('disponivel', true)
        .order('nome', { ascending: true })

      if (combosData) setCombos(combosData)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: perfil } = await supabase
          .from('perfis')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        const responsavelId = perfil?.id || user.id
        let alunosLista: any[] = []

        const { data: diretos } = await supabase
          .from('alunos')
          .select('*')
          .eq('responsavel_id', responsavelId)
          .order('nome', { ascending: true })

        if (diretos && diretos.length > 0) {
          alunosLista = diretos
        } else {
          const { data: vinculos } = await supabase
            .from('responsaveis_alunos')
            .select('aluno_id')
            .eq('responsavel_id', responsavelId)

          if (vinculos && vinculos.length > 0) {
            const ids = vinculos.map((v: { aluno_id: string }) => v.aluno_id)
            const { data: porIds } = await supabase
              .from('alunos')
              .select('*')
              .in('id', ids)
              .order('nome', { ascending: true })

            if (porIds) alunosLista = porIds
          }
        }

        if (alunosLista.length > 0) {
          const alunoIds = alunosLista.map((a) => a.id)
          const { data: carteirasData } = await supabase
            .from('carteiras')
            .select('*')
            .in('aluno_id', alunoIds)

          const mapeados: Aluno[] = alunosLista.map((a: any) => {
            const carteira = carteirasData?.find(
              (c: any) => String(c.aluno_id) === String(a.id)
            )
            const saldoReal = Number(
              carteira?.saldo ??
                carteira?.saldo_dinheiro ??
                carteira?.saldo_atual ??
                a.saldo ??
                a.saldo_atual ??
                0
            )
            const isBloqueado = Boolean(
              carteira?.bloqueado ||
                carteira?.status === 'bloqueado' ||
                a?.bloqueado === true
            )

            return {
              id: a.id,
              carteira_id: carteira?.id,
              nome: a.nome,
              turma: a.turma || 'Geral',
              saldo: saldoReal,
              bloqueado: isBloqueado,
            }
          })

          setAlunos(mapeados)
          setAlunoSelecionado(mapeados[0])
        } else {
          setAlunos([])
          setAlunoSelecionado(null)
        }
      }
    } catch (err) {
      console.error('Erro ao carregar combos:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const onRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const abrirModalComprar = (combo: Combo) => {
    setComboSelecionado(combo)
    setQuandoRetirar('hoje')
    setModalVisible(true)
  }

  const getDataRetiradaISO = () => {
    const base = new Date()
    if (quandoRetirar === 'amanha') {
      base.setDate(base.getDate() + 1)
    }
    return base.toISOString().split('T')[0]
  }

  const handleComprarCombo = async () => {
    if (!comboSelecionado || !alunoSelecionado) {
      mostrarAviso('Atenção', 'Selecione um aluno para realizar a compra.')
      return
    }

    if (alunoSelecionado.bloqueado) {
      mostrarAviso(
        'Carteira Bloqueada',
        `A carteira de ${alunoSelecionado.nome} está bloqueada. Desbloqueie na aba Cartões antes de comprar.`
      )
      return
    }

    const precoCombo = Number(comboSelecionado.preco || 0)

    if (alunoSelecionado.saldo < precoCombo) {
      const msg = `O saldo de ${alunoSelecionado.nome} é R$ ${alunoSelecionado.saldo
        .toFixed(2)
        .replace('.', ',')}. O combo custa R$ ${precoCombo
        .toFixed(2)
        .replace('.', ',')}. Deseja recarregar agora?`

      if (Platform.OS === 'web') {
        if (confirm(msg)) {
          setModalVisible(false)
          router.push('/(tabs)/recarregar' as any)
        }
      } else {
        Alert.alert('Saldo Insuficiente', msg, [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Recarregar Agora',
            onPress: () => {
              setModalVisible(false)
              router.push('/(tabs)/recarregar' as any)
            },
          },
        ])
      }
      return
    }

    setComprando(true)
    try {
      const novoSaldo = alunoSelecionado.saldo - precoCombo

      if (alunoSelecionado.carteira_id) {
        const { error: errorCarteira } = await supabase
          .from('carteiras')
          .update({ saldo: novoSaldo })
          .eq('id', alunoSelecionado.carteira_id)

        if (errorCarteira) throw errorCarteira
      }

      const { error: errorSaldo } = await supabase
        .from('alunos')
        .update({ saldo: novoSaldo })
        .eq('id', alunoSelecionado.id)

      if (errorSaldo) throw errorSaldo

      const { error: errorPedido } = await supabase.from('pedidos').insert({
        aluno_id: alunoSelecionado.id,
        valor_total: precoCombo,
        status: 'pendente',
        tipo: 'combo',
        observacao: `Combo: ${comboSelecionado.nome} (Retirada: ${getDataRetiradaISO()})`,
      })

      if (errorPedido) throw errorPedido

      setModalVisible(false)
      mostrarAviso(
        'Sucesso!',
        `Combo "${comboSelecionado.nome}" adquirido para ${alunoSelecionado.nome}!`
      )
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar compra.'
      mostrarAviso('Erro', msg)
    } finally {
      setComprando(false)
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Cabeçalho Institucional */}
      <View
        style={[
          styles.topHeader,
          { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 20 : 40) + 8 },
        ]}
      >
        <View style={styles.headerNav}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTag}>OFERTAS DA CANTINA</Text>
            <Text style={styles.headerTitle}>Combos & Promoções</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1E62D0']}
          />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color="#1E62D0" style={{ marginTop: 48 }} />
        ) : combos.length > 0 ? (
          combos.map((combo) => (
            <View key={combo.id} style={styles.comboCard}>
              <View style={styles.badgeRow}>
                <View style={styles.promoBadge}>
                  <Ionicons name="flash" size={12} color="#FFFFFF" />
                  <Text style={styles.promoBadgeText}>COMBO PROMOCIONAL</Text>
                </View>
              </View>

              <Text style={styles.comboName}>{combo.nome}</Text>
              <Text style={styles.comboDesc}>
                {combo.descricao || 'Pacote especial promocional da cantina escolar.'}
              </Text>

              <View style={styles.cardFooter}>
                <View>
                  <Text style={styles.priceLabel}>VALOR DO PACOTE</Text>
                  <Text style={styles.priceValue}>
                    R$ {Number(combo.preco).toFixed(2).replace('.', ',')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.buyBtn}
                  onPress={() => abrirModalComprar(combo)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cart-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.buyBtnText}>COMPRAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="fast-food-outline" size={38} color="#1E62D0" />
            </View>
            <Text style={styles.emptyTitle}>Nenhum Combo Disponível</Text>
            <Text style={styles.emptySub}>
              Fique atento! Novas promoções e pacotes especiais surgirão em breve.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal de Confirmação */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!comprando) setModalVisible(false)
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>CONFIRMAR PACOTE</Text>
            </View>

            <Text style={styles.modalTitle}>{comboSelecionado?.nome}</Text>
            <Text style={styles.modalPrice}>
              R$ {Number(comboSelecionado?.preco || 0).toFixed(2).replace('.', ',')}
            </Text>

            <Text style={styles.selectLabel}>SELECIONE O ALUNO</Text>
            {alunos.length > 0 ? (
              alunos.map((aluno) => {
                const selected = alunoSelecionado?.id === aluno.id
                return (
                  <TouchableOpacity
                    key={aluno.id}
                    style={[
                      styles.alunoOption,
                      selected && styles.alunoOptionSelected,
                    ]}
                    onPress={() => setAlunoSelecionado(aluno)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? '#1E62D0' : '#94A3B8'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.alunoOptionText,
                          selected && styles.alunoOptionTextSelected,
                        ]}
                      >
                        {aluno.nome}
                      </Text>
                      <Text style={styles.alunoSaldoText}>
                        Saldo: R$ {Number(aluno.saldo || 0).toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })
            ) : (
              <Text style={styles.noAlunoText}>
                Nenhum dependente vinculado à sua conta.
              </Text>
            )}

            <Text style={[styles.selectLabel, { marginTop: 10 }]}>DATA DE RETIRADA</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[
                  styles.dateChip,
                  quandoRetirar === 'hoje' && styles.dateChipSelected,
                ]}
                onPress={() => setQuandoRetirar('hoje')}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    quandoRetirar === 'hoje' && styles.dateChipTextSelected,
                  ]}
                >
                  Hoje
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dateChip,
                  quandoRetirar === 'amanha' && styles.dateChipSelected,
                ]}
                onPress={() => setQuandoRetirar('amanha')}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    quandoRetirar === 'amanha' && styles.dateChipTextSelected,
                  ]}
                >
                  Amanhã
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={comprando}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  (!alunoSelecionado || comprando) && { opacity: 0.6 },
                ]}
                onPress={handleComprarCombo}
                disabled={!alunoSelecionado || comprando}
              >
                {comprando ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
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
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTag: {
    color: '#F27835',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  scrollContent: {
    padding: 20,
  },
  comboCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  promoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F27835',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  promoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  comboName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4,
  },
  comboDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#16A34A',
    marginTop: 2,
  },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E62D0',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    elevation: 2,
    shadowColor: '#1E62D0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  buyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  modalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F27835',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  modalBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalPrice: {
    fontSize: 20,
    color: '#16A34A',
    fontWeight: '900',
    marginTop: 2,
    marginBottom: 16,
  },
  selectLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  noAlunoText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 12,
  },
  alunoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  alunoOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1E62D0',
  },
  alunoOptionText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  alunoOptionTextSelected: {
    color: '#1E2B58',
    fontWeight: '800',
  },
  alunoSaldoText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  dateChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  dateChipSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  dateChipTextSelected: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})