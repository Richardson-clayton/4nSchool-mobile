import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  Alert,
  TextInput,
  useWindowDimensions,
  Modal,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface Dependente {
  id: string
  nome: string
  turma?: string
  saldo: number
  limite_diario?: number
  avatar_url?: string | null
}

type MetodoPagamento = 'pix' | 'cartao' | 'recorrente'

export default function RecarregarScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768

  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [valor, setValor] = useState<string>('30')
  const [metodo, setMetodo] = useState<MetodoPagamento>('pix')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processando, setProcessando] = useState(false)

  // Modal de Ajuste de Limite Diário
  const [modalLimite, setModalLimite] = useState(false)
  const [novoLimite, setNovoLimite] = useState<string>('20')

  // PIX Gerado
  const [pixGerado, setPixGerado] = useState<{
    qrCodeUrl: string
    payloadCopiaCola: string
    valor: number
  } | null>(null)

  const valoresPredefinidos = ['15', '30', '50', '100']

  const fetchAlunos = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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

      if (alunosLista.length === 0) {
        setDependentes([])
        return
      }

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
        console.log('Tabela carteiras não consultada:', e)
      }

      const mapeados: Dependente[] = alunosLista.map((a: any) => {
        const aid = String(a.id)
        const saldoFinal = carteirasMap[aid] !== undefined ? carteirasMap[aid] : Number(a.saldo ?? a.saldo_atual ?? 0)
        return {
          id: aid,
          nome: a.nome || 'Aluno',
          turma: a.turma || 'Turma A',
          saldo: saldoFinal,
          limite_diario: a.limite_diario ?? 20,
          avatar_url: a.foto_url || a.avatar_url || a.foto || null,
        }
      })

      setDependentes(mapeados)
      if (mapeados.length > 0 && !alunoSelecionado) {
        setAlunoSelecionado(mapeados[0])
        setNovoLimite(String(mapeados[0].limite_diario || 20))
      }
    } catch (err) {
      console.error('Erro ao buscar alunos para recarga:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAlunos()
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchAlunos()
  }, [])

  const handleProcessarRecarga = async () => {
    if (!alunoSelecionado) {
      const msg = 'Selecione o aluno que receberá a recarga.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Atenção', msg)
      return
    }

    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum < 5) {
      const msg = 'O valor mínimo para recarga é de R$ 5,00.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Valor Inválido', msg)
      return
    }

    setProcessando(true)

    try {
      if (metodo === 'pix') {
        const payloadMock = `00020126580014br.gov.bcb.pix0136nutrischool-${alunoSelecionado.id}-${Date.now()}5204000053039865405${valorNum.toFixed(2)}5802BR5913NUTRISCHOOL CANT6008FORTALEZA62070503***6304`
        const qrCodeMock = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payloadMock)}`

        setPixGerado({
          qrCodeUrl: qrCodeMock,
          payloadCopiaCola: payloadMock,
          valor: valorNum,
        })
      } else if (metodo === 'cartao') {
        const msg = `Recarga de R$ ${valorNum.toFixed(2)} solicitada via Cartão de Crédito para ${alunoSelecionado.nome}.`
        if (Platform.OS === 'web') alert(msg)
        else Alert.alert('Cartão Processado', msg)
      } else {
        const msg = `Recarga recorrente configurada: R$ ${valorNum.toFixed(2)} serão adicionados automaticamente para ${alunoSelecionado.nome} quando o saldo estiver abaixo de R$ 10,00.`
        if (Platform.OS === 'web') alert(msg)
        else Alert.alert('Recarga Automática Ativada', msg)
      }
    } catch (e: any) {
      console.error('Erro ao processar recarga:', e)
    } finally {
      setProcessando(false)
    }
  }

  const handleCopiarChave = () => {
    if (!pixGerado) return
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(pixGerado.payloadCopiaCola)
      alert('Chave Pix Copia e Cola copiada para a área de transferência!')
    } else {
      Alert.alert('Sucesso', 'Chave Pix copiada com sucesso!')
    }
  }

  const salvarLimiteDiario = async () => {
    if (!alunoSelecionado) return
    const limiteNum = parseFloat(novoLimite.replace(',', '.'))

    if (isNaN(limiteNum) || limiteNum < 0) {
      const msg = 'Informe um valor válido para o limite diário.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Erro', msg)
      return
    }

    try {
      const { error } = await supabase
        .from('alunos')
        .update({ limite_diario: limiteNum })
        .eq('id', alunoSelecionado.id)

      if (error) throw error

      setAlunoSelecionado({ ...alunoSelecionado, limite_diario: limiteNum })
      setModalLimite(false)
      const msg = `Limite diário de ${alunoSelecionado.nome} atualizado para R$ ${limiteNum.toFixed(2)}.`
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Sucesso', msg)
    } catch (err: any) {
      console.error('Erro ao salvar limite:', err)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingBottom: Math.max(insets.bottom + 40, 60) },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
    >
      <View style={[styles.mainWrapper, isTablet && styles.mainWrapperTablet]}>
        <View style={styles.header}>
          <Text style={styles.title}>Hub Financeiro & Recargas</Text>
          <Text style={styles.subtitle}>Gerencie saldo, limites de consumo e formas de pagamento dos seus filhos</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 40 }} />
        ) : dependentes.length > 0 ? (
          <>
            {/* 1. SELEÇÃO DE DEPENDENTES */}
            <Text style={styles.stepLabel}>1. SELECIONE O DEPENDENTE</Text>
            <View style={styles.studentsGrid}>
              {dependentes.map((dep) => {
                const isSelected = alunoSelecionado?.id === dep.id
                return (
                  <TouchableOpacity
                    key={dep.id}
                    style={[styles.studentCard, isSelected && styles.studentCardSelected]}
                    onPress={() => {
                      setAlunoSelecionado(dep)
                      setNovoLimite(String(dep.limite_diario || 20))
                      setPixGerado(null)
                    }}
                    activeOpacity={0.88}
                  >
                    <View style={styles.avatarWrapper}>
                      {dep.avatar_url ? (
                        <Image source={{ uri: dep.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <View style={[styles.avatarBadge, isSelected && styles.avatarBadgeSelected]}>
                          <Text style={[styles.avatarInitial, isSelected && styles.avatarInitialSelected]}>
                            {dep.nome.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={[styles.studentName, isSelected && styles.studentNameSelected]} numberOfLines={1}>
                      {dep.nome}
                    </Text>

                    <View style={[styles.saldoBadge, isSelected && styles.saldoBadgeSelected]}>
                      <Text style={[styles.saldoBadgeText, isSelected && styles.saldoBadgeTextSelected]}>
                        Saldo: R$ {dep.saldo.toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* PAINEL DE CONTROLE DE LIMITES */}
            {alunoSelecionado && (
              <View style={styles.controlBox}>
                <View style={styles.controlHeader}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#2563EB" />
                  <Text style={styles.controlTitle}>Controles de Consumo do Aluno</Text>
                </View>

                <View style={styles.controlRow}>
                  <View>
                    <Text style={styles.controlLabel}>Limite de Gasto Diário na Cantina</Text>
                    <Text style={styles.controlValue}>
                      R$ {alunoSelecionado.limite_diario ? alunoSelecionado.limite_diario.toFixed(2).replace('.', ',') : 'Sem limite'} / dia
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.controlBtn}
                    onPress={() => setModalLimite(true)}
                  >
                    <Text style={styles.controlBtnText}>Ajustar Limite</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 2. SELEÇÃO DE VALORES */}
            <Text style={styles.stepLabel}>2. VALOR DA RECARGA</Text>
            <View style={styles.quickValuesGrid}>
              {valoresPredefinidos.map((v) => {
                const isSelected = valor === v
                return (
                  <TouchableOpacity
                    key={v}
                    style={[styles.quickValueChip, isSelected && styles.quickValueChipSelected]}
                    onPress={() => {
                      setValor(v)
                      setPixGerado(null)
                    }}
                  >
                    <Text style={[styles.quickValueText, isSelected && styles.quickValueTextSelected]}>
                      R$ {v},00
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={styles.customValueInputWrapper}>
              <Text style={styles.currencyPrefix}>R$</Text>
              <TextInput
                style={styles.customValueInput}
                placeholder="Outro valor (mínimo R$ 5,00)"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={valor}
                onChangeText={(txt) => {
                  setValor(txt)
                  setPixGerado(null)
                }}
              />
            </View>

            {/* 3. MÉTODOS DE PAGAMENTO */}
            <Text style={styles.stepLabel}>3. FORMA DE PAGAMENTO</Text>
            <View style={styles.metodosWrapper}>
              <TouchableOpacity
                style={[styles.metodoCard, metodo === 'pix' && styles.metodoCardSelected]}
                onPress={() => {
                  setMetodo('pix')
                  setPixGerado(null)
                }}
              >
                <Ionicons name="qr-code-outline" size={22} color={metodo === 'pix' ? '#2563EB' : '#64748B'} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metodoTitle, metodo === 'pix' && styles.metodoTitleSelected]}>
                    PIX Instantâneo
                  </Text>
                  <Text style={styles.metodoSub}>Aprovação e saldo liberado na hora</Text>
                </View>
                {metodo === 'pix' && <Ionicons name="checkmark-circle" size={18} color="#2563EB" />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.metodoCard, metodo === 'cartao' && styles.metodoCardSelected]}
                onPress={() => {
                  setMetodo('cartao')
                  setPixGerado(null)
                }}
              >
                <Ionicons name="card-outline" size={22} color={metodo === 'cartao' ? '#2563EB' : '#64748B'} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metodoTitle, metodo === 'cartao' && styles.metodoTitleSelected]}>
                    Cartão de Crédito / Débito
                  </Text>
                  <Text style={styles.metodoSub}>Pague à vista ou parcele</Text>
                </View>
                {metodo === 'cartao' && <Ionicons name="checkmark-circle" size={18} color="#2563EB" />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.metodoCard, metodo === 'recorrente' && styles.metodoCardSelected]}
                onPress={() => {
                  setMetodo('recorrente')
                  setPixGerado(null)
                }}
              >
                <Ionicons name="repeat-outline" size={22} color={metodo === 'recorrente' ? '#2563EB' : '#64748B'} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metodoTitle, metodo === 'recorrente' && styles.metodoTitleSelected]}>
                    Recarga Automática
                  </Text>
                  <Text style={styles.metodoSub}>Recarrega automaticamente quando o saldo estiver baixo</Text>
                </View>
                {metodo === 'recorrente' && <Ionicons name="checkmark-circle" size={18} color="#2563EB" />}
              </TouchableOpacity>
            </View>

            {/* BOTÃO CONFIRMAR */}
            <TouchableOpacity
              style={[styles.generateButton, processando && styles.generateButtonDisabled]}
              onPress={handleProcessarRecarga}
              disabled={processando}
              activeOpacity={0.88}
            >
              {processando ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>
                    {metodo === 'pix'
                      ? 'GERAR CHAVE PIX'
                      : metodo === 'cartao'
                      ? 'PAGAR COM CARTÃO'
                      : 'CONFIGURAR RECARGA AUTOMÁTICA'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* EXIBIÇÃO DO PIX GERADO */}
            {pixGerado && metodo === 'pix' && (
              <View style={styles.pixBoxContainer}>
                <View style={styles.pixBoxHeader}>
                  <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                  <Text style={styles.pixBoxTitle}>Pix Gerado com Sucesso!</Text>
                </View>

                <Text style={styles.pixBoxSub}>
                  Recarga de <Text style={{ fontWeight: '800' }}>R$ {pixGerado.valor.toFixed(2).replace('.', ',')}</Text> para o aluno{' '}
                  <Text style={{ fontWeight: '800' }}>{alunoSelecionado?.nome}</Text>
                </Text>

                <View style={styles.qrCodeWrapper}>
                  <Image source={{ uri: pixGerado.qrCodeUrl }} style={styles.qrCodeImage} />
                </View>

                <TouchableOpacity style={styles.copyColaButton} onPress={handleCopiarChave}>
                  <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.copyColaButtonText}>COPIAR CHAVE PIX COPIA E COLA</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-circle-outline" size={56} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Nenhum dependente encontrado</Text>
            <Text style={styles.emptySub}>Cadastre seus filhos no menu Alunos para efetuar recargas.</Text>
          </View>
        )}
      </View>

      {/* MODAL DE AJUSTE DE LIMITE DIÁRIO */}
      <Modal visible={modalLimite} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ajustar Limite Diário</Text>
            <Text style={styles.modalSub}>
              Defina o valor máximo que <Text style={{ fontWeight: '800' }}>{alunoSelecionado?.nome}</Text> pode gastar por dia na cantina:
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Ex: 25,00"
              keyboardType="numeric"
              value={novoLimite}
              onChangeText={setNovoLimite}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalLimite(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={salvarLimiteDiario}>
                <Text style={styles.modalSaveText}>Salvar Limite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 24 : 48,
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
  },
  mainWrapper: {
    width: '100%',
  },
  mainWrapperTablet: {
    maxWidth: 720,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 12,
    letterSpacing: 0.6,
  },
  studentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  studentCard: {
    flex: 1,
    minWidth: 140,
    maxWidth: 220,
    height: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentCardSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  avatarWrapper: {
    alignItems: 'center',
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2563EB',
  },
  avatarInitialSelected: {
    color: '#FFFFFF',
  },
  studentName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    width: '100%',
  },
  studentNameSelected: {
    color: '#FFFFFF',
  },
  saldoBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: '100%',
    alignItems: 'center',
  },
  saldoBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  saldoBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  saldoBadgeTextSelected: {
    color: '#FFFFFF',
  },
  controlBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  controlTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  controlValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 2,
  },
  controlBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  controlBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  quickValuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  quickValueChip: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickValueChipSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  quickValueText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  quickValueTextSelected: {
    color: '#FFFFFF',
  },
  customValueInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 20,
  },
  currencyPrefix: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 10,
  },
  customValueInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  metodosWrapper: {
    gap: 10,
    marginBottom: 20,
  },
  metodoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metodoCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FAFC',
  },
  metodoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  metodoTitleSelected: {
    color: '#2563EB',
  },
  metodoSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  generateButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: '#F27835',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  generateButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  pixBoxContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    marginBottom: 20,
  },
  pixBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pixBoxTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16A34A',
  },
  pixBoxSub: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  qrCodeWrapper: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  qrCodeImage: {
    width: 180,
    height: 180,
  },
  copyColaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  copyColaButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    marginVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  modalSaveText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})