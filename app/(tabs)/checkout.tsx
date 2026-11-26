import React, { useState, useEffect, useMemo } from 'react'
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
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as LocalAuthentication from 'expo-local-authentication'

interface ItemPedido {
  id: string
  nome: string
  preco: number
  quantidade: number
}

interface Dependente {
  id: string
  nome: string
  turma?: string
  saldo: number
  bloqueado: boolean
  alergias?: string | null
}

export default function CheckoutScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const insets = useSafeAreaInsets()

  const itensCarrinho: ItemPedido[] = useMemo(() => {
    try {
      if (!params.carrinho) return []
      const raw = Array.isArray(params.carrinho) ? params.carrinho[0] : params.carrinho
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [params.carrinho])

  const totalPedido = useMemo(
    () =>
      itensCarrinho.reduce(
        (acc, item) => acc + Number(item.preco) * Number(item.quantidade),
        0
      ),
    [itensCarrinho]
  )

  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [tipoEntrega, setTipoEntrega] = useState<'cantina' | 'sala'>('cantina')
  const [formaPagamento, setFormaPagamento] = useState<'carteira' | 'pix' | 'cartao'>('carteira')

  const [loadingData, setLoadingData] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [modalSenhaVisible, setModalSenhaVisible] = useState(false)
  const [senhaConfirmacao, setSenhaConfirmacao] = useState('')
  const [erroSenha, setErroSenha] = useState<string | null>(null)

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  useEffect(() => {
    const fetchDependentes = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

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

          const mapeados: Dependente[] = alunosLista.map((a: any) => {
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
              nome: a.nome,
              turma: a.turma || 'Geral',
              saldo: saldoReal,
              bloqueado: isBloqueado,
              alergias: a.alergias || a.restricoes_alimentares || null,
            }
          })

          setDependentes(mapeados)
          setAlunoSelecionado(mapeados[0])
        }
      } catch (err) {
        console.error('Erro ao carregar dependentes:', err)
      } finally {
        setLoadingData(false)
      }
    }

    fetchDependentes()
  }, [])

  const handleFinalizarCompra = async () => {
    if (itensCarrinho.length === 0) {
      mostrarAviso('Carrinho vazio', 'Adicione itens antes de finalizar o pedido.')
      return
    }

    if (!alunoSelecionado) {
      mostrarAviso('Atenção', 'Selecione o dependente que receberá o lanche.')
      return
    }

    if (alunoSelecionado.bloqueado) {
      mostrarAviso(
        'Carteira Bloqueada',
        `A carteira de ${alunoSelecionado.nome} está bloqueada. Desbloqueie na aba Cartões para concluir o pedido.`
      )
      return
    }

    if (formaPagamento === 'carteira') {
      if (alunoSelecionado.saldo < totalPedido) {
        const msg = `O aluno ${alunoSelecionado.nome} possui R$ ${alunoSelecionado.saldo
          .toFixed(2)
          .replace('.', ',')} de saldo. Deseja realizar uma recarga agora?`

        if (Platform.OS === 'web') {
          if (confirm(msg)) {
            router.push('/(tabs)/recarregar' as any)
          }
        } else {
          Alert.alert('Saldo Insuficiente', msg, [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Recarregar Agora',
              onPress: () => router.push('/(tabs)/recarregar' as any),
            },
          ])
        }
        return
      }

      if (Platform.OS !== 'web') {
        try {
          const hasHardware = await LocalAuthentication.hasHardwareAsync()
          const isEnrolled = await LocalAuthentication.isEnrolledAsync()

          if (hasHardware && isEnrolled) {
            const authResult = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Confirme a compra com sua Biometria ou Facial',
              fallbackLabel: 'Usar Senha',
            })

            if (authResult.success) {
              await executarVenda()
              return
            }
          }
        } catch (bioErr) {
          console.log('Fallback para senha:', bioErr)
        }
      }

      setSenhaConfirmacao('')
      setErroSenha(null)
      setModalSenhaVisible(true)
    } else if (formaPagamento === 'pix') {
      router.push({
        pathname: '/(tabs)/recarregar',
        params: { valor: totalPedido.toFixed(2), alunoId: alunoSelecionado.id },
      } as any)
    } else {
      mostrarAviso('Cartão de Crédito', 'Pagamento via cartão disponível na tela de recarga.')
    }
  }

  const confirmarComSenha = async () => {
    if (!senhaConfirmacao.trim()) {
      setErroSenha('Informe sua senha de acesso.')
      return
    }

    try {
      setProcessando(true)
      setErroSenha(null)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.email) {
        throw new Error('Sessão inválida. Faça login novamente.')
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: senhaConfirmacao,
      })

      if (authError) {
        setErroSenha('Senha incorreta. Tente novamente.')
        setProcessando(false)
        return
      }

      await executarVenda()
    } catch (err: any) {
      setErroSenha(err?.message || 'Erro ao validar senha.')
      setProcessando(false)
    }
  }

  const executarVenda = async () => {
    try {
      setProcessando(true)
      const { error } = await supabase.rpc('processar_venda_mobile', {
        p_aluno_id: alunoSelecionado?.id,
        p_itens: itensCarrinho,
        p_total: totalPedido,
        p_tipo_entrega: tipoEntrega,
      })

      if (error) throw error

      setModalSenhaVisible(false)
      mostrarAviso('Sucesso!', 'O pedido foi enviado para a cantina com sucesso.')
      router.replace('/(tabs)/pedidos' as any)
    } catch (err: any) {
      mostrarAviso('Erro no Pedido', err.message || 'Não foi possível processar a venda.')
    } finally {
      setProcessando(false)
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
            <Text style={styles.headerTag}>FINALIZAR COMPRA</Text>
            <Text style={styles.headerTitle}>Resumo do Pedido</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. SELEÇÃO DO ALUNO */}
        <Text style={styles.sectionHeader}>LANCHE PARA</Text>
        {loadingData ? (
          <ActivityIndicator size="small" color="#1E62D0" style={{ marginBottom: 20 }} />
        ) : dependentes.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
          >
            {dependentes.map((dep) => {
              const selected = alunoSelecionado?.id === dep.id
              return (
                <TouchableOpacity
                  key={dep.id}
                  style={[styles.depChip, selected && styles.depChipSelected]}
                  onPress={() => setAlunoSelecionado(dep)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={selected ? 'person-circle' : 'person-circle-outline'}
                    size={18}
                    color={selected ? '#FFFFFF' : '#1E2B58'}
                  />
                  <View>
                    <Text style={[styles.depText, selected && styles.depTextSelected]}>
                      {dep.nome}
                    </Text>
                    <Text
                      style={[
                        styles.depSaldoText,
                        selected && styles.depSaldoTextSelected,
                      ]}
                    >
                      Saldo: R$ {dep.saldo.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>Nenhum dependente vinculado.</Text>
        )}

        {/* Alerta de Restrições Alimentares do Aluno */}
        {alunoSelecionado?.alergias ? (
          <View style={styles.alergiaBanner}>
            <Ionicons name="warning" size={18} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alergiaTitle}>Atenção às Restrições Alimentares</Text>
              <Text style={styles.alergiaText}>{alunoSelecionado.alergias}</Text>
            </View>
          </View>
        ) : null}

        {/* 2. ITENS DO CARRINHO */}
        <Text style={styles.sectionHeader}>ITENS SELECIONADOS</Text>
        <View style={styles.boxContainer}>
          {itensCarrinho.length > 0 ? (
            itensCarrinho.map((item, i) => (
              <View key={`${item.id}-${i}`} style={styles.itemRow}>
                <View style={styles.itemQtyBadge}>
                  <Text style={styles.itemQtyText}>{item.quantidade}x</Text>
                </View>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.nome}
                </Text>
                <Text style={styles.itemPrice}>
                  R$ {(item.preco * item.quantidade).toFixed(2).replace('.', ',')}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Nenhum item selecionado.</Text>
          )}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL FINAL</Text>
            <Text style={styles.totalValue}>
              R$ {totalPedido.toFixed(2).replace('.', ',')}
            </Text>
          </View>
        </View>

        {/* 3. OPÇÃO DE ENTREGA */}
        <Text style={styles.sectionHeader}>OPÇÃO DE ENTREGA</Text>
        <View style={styles.boxContainer}>
          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={[styles.optionBtn, tipoEntrega === 'cantina' && styles.optionBtnSelected]}
              onPress={() => setTipoEntrega('cantina')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="storefront-outline"
                size={18}
                color={tipoEntrega === 'cantina' ? '#FFFFFF' : '#1E2B58'}
              />
              <Text
                style={[
                  styles.optionText,
                  tipoEntrega === 'cantina' && styles.optionTextSelected,
                ]}
              >
                Retirar na Cantina
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionBtn, tipoEntrega === 'sala' && styles.optionBtnSelected]}
              onPress={() => setTipoEntrega('sala')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="school-outline"
                size={18}
                color={tipoEntrega === 'sala' ? '#FFFFFF' : '#1E2B58'}
              />
              <Text
                style={[styles.optionText, tipoEntrega === 'sala' && styles.optionTextSelected]}
              >
                Entrega na Sala
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. FORMA DE PAGAMENTO */}
        <Text style={styles.sectionHeader}>FORMA DE PAGAMENTO</Text>
        <View style={styles.boxContainer}>
          {(['carteira', 'pix', 'cartao'] as const).map((forma, idx) => {
            const active = formaPagamento === forma
            return (
              <TouchableOpacity
                key={forma}
                style={[
                  styles.paymentRow,
                  active && styles.paymentRowSelected,
                  idx === 2 && { marginBottom: 0 },
                ]}
                onPress={() => setFormaPagamento(forma)}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.paymentIconCircle,
                    active && styles.paymentIconCircleSelected,
                  ]}
                >
                  <Ionicons
                    name={
                      forma === 'carteira'
                        ? 'wallet-outline'
                        : forma === 'pix'
                        ? 'flash-outline'
                        : 'card-outline'
                    }
                    size={18}
                    color={active ? '#FFFFFF' : '#1E2B58'}
                  />
                </View>
                <Text style={[styles.paymentText, active && styles.paymentTextSelected]}>
                  {forma === 'carteira'
                    ? 'Carteira Escolar (Biometria / Senha)'
                    : forma === 'pix'
                    ? 'Pix Instantâneo'
                    : 'Cartão de Crédito'}
                </Text>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={active ? '#1E62D0' : '#CBD5E1'}
                />
              </TouchableOpacity>
            )
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.confirmBtn,
            (processando || itensCarrinho.length === 0) && styles.confirmBtnDisabled,
          ]}
          onPress={handleFinalizarCompra}
          disabled={processando || itensCarrinho.length === 0}
          activeOpacity={0.85}
        >
          {processando ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.confirmBtnText}>PROCESSANDO...</Text>
            </View>
          ) : (
            <Text style={styles.confirmBtnText}>CONFIRMAR E PAGAR</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL CONFIRMAÇÃO COM SENHA */}
      <Modal
        visible={modalSenhaVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!processando) setModalSenhaVisible(false)
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="lock-closed" size={22} color="#1E62D0" />
            </View>

            <Text style={styles.modalTitle}>Autorizar Pagamento</Text>
            <Text style={styles.modalSubtitle}>
              Digite sua senha de acesso para confirmar o débito de{' '}
              <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                R$ {totalPedido.toFixed(2).replace('.', ',')}
              </Text>
            </Text>

            {erroSenha && <Text style={styles.modalError}>{erroSenha}</Text>}

            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="••••••••••••"
              placeholderTextColor="#94A3B8"
              value={senhaConfirmacao}
              onChangeText={setSenhaConfirmacao}
              editable={!processando}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalSenhaVisible(false)}
                disabled={processando}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, processando && { opacity: 0.7 }]}
                onPress={confirmarComSenha}
                disabled={processando}
              >
                {processando ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Autorizar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  content: {
    padding: 20,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  depChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 10,
  },
  depChipSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  depText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  depTextSelected: {
    color: '#FFFFFF',
  },
  depSaldoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  depSaldoTextSelected: {
    color: '#DBEAFE',
  },
  alergiaBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  alergiaTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  alergiaText: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 2,
  },
  boxContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  itemQtyBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  itemQtyText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E62D0',
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E2B58',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  optionBtnSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  optionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E2B58',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  paymentRowSelected: {
    borderColor: '#1E62D0',
    backgroundColor: '#EFF6FF',
  },
  paymentIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentIconCircleSelected: {
    backgroundColor: '#1E62D0',
  },
  paymentText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  paymentTextSelected: {
    color: '#1E2B58',
  },
  confirmBtn: {
    backgroundColor: '#16A34A',
    height: 52,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    elevation: 3,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  modalError: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    textAlign: 'center',
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#1E62D0',
    height: 46,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
})