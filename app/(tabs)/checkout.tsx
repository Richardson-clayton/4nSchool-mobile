import React, { useState, useEffect } from 'react'
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
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
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
}

export default function CheckoutScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()

  const itensCarrinho: ItemPedido[] = params.carrinho ? JSON.parse(params.carrinho as string) : []
  const totalPedido = itensCarrinho.reduce((acc, item) => acc + item.preco * item.quantidade, 0)

  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [tipoEntrega, setTipoEntrega] = useState<'cantina' | 'sala'>('cantina')
  const [formaPagamento, setFormaPagamento] = useState<'carteira' | 'pix' | 'cartao'>('carteira')
  
  const [loadingData, setLoadingData] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [modalSenhaVisible, setModalSenhaVisible] = useState(false)
  const [senhaConfirmacao, setSenhaConfirmacao] = useState('')

  useEffect(() => {
    const fetchDependentes = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: alunos } = await supabase
          .from('alunos')
          .select('id, nome, turma, carteiras(saldo)')
          .eq('responsavel_id', user.id)

        if (alunos) {
          const mapeados = alunos.map((a: any) => ({
            id: a.id,
            nome: a.nome,
            turma: a.turma || 'Geral',
            saldo: Number(a.carteiras?.[0]?.saldo ?? 0),
          }))
          setDependentes(mapeados)
          if (mapeados.length > 0) setAlunoSelecionado(mapeados[0])
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
    if (!alunoSelecionado) {
      Alert.alert('Atenção', 'Selecione o dependente que receberá o lanche.')
      return
    }

    if (formaPagamento === 'carteira') {
      if (alunoSelecionado.saldo < totalPedido) {
        Alert.alert(
          'Saldo Insuficiente',
          `O aluno ${alunoSelecionado.nome} possui R$ ${alunoSelecionado.saldo.toFixed(2).replace('.', ',')} de saldo. Deseja realizar uma recarga agora?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Recarregar Agora',
              onPress: () => router.push('/(tabs)/recarregar' as any),
            },
          ]
        )
        return
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const isEnrolled = await LocalAuthentication.isEnrolledAsync()

      if (hasHardware && isEnrolled) {
        const authResult = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirme a compra com a sua Biometria/Facial',
          fallbackLabel: 'Usar Senha',
        })

        if (authResult.success) {
          executarVenda()
          return
        }
      }

      setModalSenhaVisible(true)
    } else if (formaPagamento === 'pix') {
      router.push({
        pathname: '/(tabs)/recarregar',
        params: { valor: totalPedido.toString(), alunoId: alunoSelecionado.id },
      } as any)
    } else {
      Alert.alert('Cartão de Crédito', 'Redirecionando para o pagamento...')
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

      Alert.alert('Sucesso!', 'O pedido foi enviado para a cantina com sucesso.')
      router.replace('/(tabs)/pedidos' as any)
    } catch (err: any) {
      Alert.alert('Erro no Pedido', err.message || 'Não foi possível processar a venda.')
    } finally {
      setProcessando(false)
      setModalSenhaVisible(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#0F172A" />
      </TouchableOpacity>

      <Text style={styles.title}>Resumo do Pedido</Text>

      {/* 1. SELEÇÃO DO ALUNO */}
      <Text style={styles.sectionHeader}>LANCHE PARA</Text>
      {loadingData ? (
        <ActivityIndicator size="small" color="#2563EB" style={{ marginBottom: 20 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {dependentes.map((dep) => (
            <TouchableOpacity
              key={dep.id}
              style={[styles.depChip, alunoSelecionado?.id === dep.id && styles.depChipSelected]}
              onPress={() => setAlunoSelecionado(dep)}
            >
              <Text style={[styles.depText, alunoSelecionado?.id === dep.id && styles.depTextSelected]}>
                {dep.nome} (R$ {dep.saldo.toFixed(2).replace('.', ',')})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 2. ITENS DO CARRINHO */}
      <Text style={styles.sectionHeader}>ITENS SELECIONADOS</Text>
      <View style={styles.boxContainer}>
        {itensCarrinho.length > 0 ? (
          itensCarrinho.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.quantidade}x {item.nome}</Text>
              <Text style={styles.itemPrice}>R$ {(item.preco * item.quantidade).toFixed(2).replace('.', ',')}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Nenhum item selecionado.</Text>
        )}
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL FINAL</Text>
          <Text style={styles.totalValue}>R$ {totalPedido.toFixed(2).replace('.', ',')}</Text>
        </View>
      </View>

      {/* 3. OPÇÃO DE ENTREGA */}
      <Text style={styles.sectionHeader}>OPÇÃO DE ENTREGA</Text>
      <View style={styles.boxContainer}>
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={[styles.optionBtn, tipoEntrega === 'cantina' && styles.optionBtnSelected]}
            onPress={() => setTipoEntrega('cantina')}
          >
            <Ionicons name="storefront-outline" size={18} color={tipoEntrega === 'cantina' ? '#FFF' : '#2563EB'} />
            <Text style={[styles.optionText, tipoEntrega === 'cantina' && styles.optionTextSelected]}>Retirar na Cantina</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionBtn, tipoEntrega === 'sala' && styles.optionBtnSelected]}
            onPress={() => setTipoEntrega('sala')}
          >
            <Ionicons name="school-outline" size={18} color={tipoEntrega === 'sala' ? '#FFF' : '#2563EB'} />
            <Text style={[styles.optionText, tipoEntrega === 'sala' && styles.optionTextSelected]}>Entrega na Sala</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. FORMA DE PAGAMENTO */}
      <Text style={styles.sectionHeader}>FORMA DE PAGAMENTO</Text>
      <View style={styles.boxContainer}>
        {(['carteira', 'pix', 'cartao'] as const).map((forma) => (
          <TouchableOpacity
            key={forma}
            style={[styles.paymentRow, formaPagamento === forma && styles.paymentRowSelected]}
            onPress={() => setFormaPagamento(forma)}
          >
            <Ionicons
              name={forma === 'carteira' ? 'wallet-outline' : forma === 'pix' ? 'flash-outline' : 'card-outline'}
              size={20}
              color={formaPagamento === forma ? '#2563EB' : '#64748B'}
            />
            <Text style={styles.paymentText}>
              {forma === 'carteira' ? 'Carteira Escolar (Biometria / Senha)' : forma === 'pix' ? 'Pix Instantâneo' : 'Cartão de Crédito'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.confirmBtn, processando && styles.confirmBtnDisabled]}
        onPress={handleFinalizarCompra}
        disabled={processando}
      >
        {processando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>CONFIRMAR E PAGAR</Text>}
      </TouchableOpacity>

      {/* MODAL CONFIRMAÇÃO COM SENHA */}
      <Modal visible={modalSenhaVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Digite sua Senha de Segurança</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="••••••••"
              value={senhaConfirmacao}
              onChangeText={setSenhaConfirmacao}
            />
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={executarVenda}>
              <Text style={styles.modalConfirmText}>Autorizar Pagamento</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingTop: Platform.OS === 'web' ? 24 : 50 },
  backBtn: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 20 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 8, letterSpacing: 0.5 },
  depChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', marginRight: 8 },
  depChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  depText: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  depTextSelected: { color: '#FFF' },
  boxContainer: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemName: { fontSize: 13, fontWeight: '600', color: '#334155' },
  itemPrice: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  emptyText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginVertical: 8 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  totalValue: { fontSize: 18, fontWeight: '900', color: '#2563EB' },
  optionsRow: { flexDirection: 'row', gap: 10 },
  optionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderColor: '#2563EB', borderRadius: 12 },
  optionBtnSelected: { backgroundColor: '#2563EB' },
  optionText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  optionTextSelected: { color: '#FFF' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  paymentRowSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  paymentText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  confirmBtn: { backgroundColor: '#16A34A', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  confirmBtnDisabled: { backgroundColor: '#94A3B8' },
  confirmBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 14 },
  modalInput: { width: '100%', height: 48, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', textAlign: 'center', fontSize: 18, marginBottom: 16 },
  modalConfirmBtn: { backgroundColor: '#2563EB', paddingVertical: 12, width: '100%', borderRadius: 12, alignItems: 'center' },
  modalConfirmText: { color: '#FFF', fontWeight: '800' },
})