import React, { useEffect, useState } from 'react'
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
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface Aluno {
  id: string
  nome: string
  turma?: string
  saldo: number
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
  const [combos, setCombos] = useState<Combo[]>([])
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(true)
  const [comboSelecionado, setComboSelecionado] = useState<Combo | null>(null)
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [comprando, setComprando] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)

      const { data: combosData } = await supabase
        .from('combos')
        .select('*')
        .eq('disponivel', true)

      if (combosData) setCombos(combosData)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: alunosData } = await supabase
          .from('alunos')
          .select('id, nome, turma, saldo')
          .eq('responsavel_id', user.id)

        if (alunosData) {
          setAlunos(alunosData)
          if (alunosData.length > 0) setAlunoSelecionado(alunosData[0])
        }
      }
    } catch (err) {
      console.error('Erro ao carregar combos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const abrirModalComprar = (combo: Combo) => {
    setComboSelecionado(combo)
    setModalVisible(true)
  }

  const handleComprarCombo = async () => {
    if (!comboSelecionado || !alunoSelecionado) {
      Alert.alert('Atenção', 'Selecione um aluno para realizar a compra.')
      return
    }

    if (alunoSelecionado.saldo < comboSelecionado.preco) {
      Alert.alert(
        'Saldo Insuficiente',
        `O saldo do aluno (${alunoSelecionado.nome}) é R$ ${alunoSelecionado.saldo.toFixed(2)}. O combo custa R$ ${comboSelecionado.preco.toFixed(2)}.`
      )
      return
    }

    setComprando(true)
    try {
      const novoSaldo = alunoSelecionado.saldo - comboSelecionado.preco

      const { error: errorSaldo } = await supabase
        .from('alunos')
        .update({ saldo: novoSaldo })
        .eq('id', alunoSelecionado.id)

      if (errorSaldo) throw errorSaldo

      const { error: errorPedido } = await supabase.from('pedidos').insert({
        aluno_id: alunoSelecionado.id,
        valor_total: comboSelecionado.preco,
        status: 'pendente',
        tipo: 'combo',
      })

      if (errorPedido) throw errorPedido

      Alert.alert('Sucesso!', `Combo "${comboSelecionado.nome}" adquirido para ${alunoSelecionado.nome}!`)
      setModalVisible(false)
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar compra.'
      Alert.alert('Erro', msg)
    } finally {
      setComprando(false)
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Combos & Promoções</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : combos.length > 0 ? (
        combos.map((combo) => (
          <View key={combo.id} style={styles.comboCard}>
            <View style={styles.badgeRow}>
              <View style={styles.promoBadge}>
                <Ionicons name="flash-outline" size={12} color="#2563EB" />
                <Text style={styles.promoBadgeText}>OFERTA IMPERDÍVEL</Text>
              </View>
            </View>

            <Text style={styles.comboName}>{combo.nome}</Text>
            <Text style={styles.comboDesc}>{combo.descricao || 'Pacote especial promocional da cantina.'}</Text>

            <View style={styles.cardFooter}>
              <View>
                <Text style={styles.priceLabel}>Preço do Combo</Text>
                <Text style={styles.priceValue}>R$ {Number(combo.preco).toFixed(2).replace('.', ',')}</Text>
              </View>

              <TouchableOpacity
                style={styles.buyBtn}
                onPress={() => abrirModalComprar(combo)}
                activeOpacity={0.85}
              >
                <Ionicons name="cart-outline" size={16} color="#FFFFFF" />
                <Text style={styles.buyBtnText}>Comprar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="fast-food-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Nenhum Combo Disponível</Text>
          <Text style={styles.emptySub}>Fique atento! Novas promoções surgirão em breve.</Text>
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirmar Compra</Text>
            <Text style={styles.modalSub}>{comboSelecionado?.nome}</Text>

            <Text style={styles.selectLabel}>Selecione o Aluno:</Text>
            {alunos.map((aluno) => (
              <TouchableOpacity
                key={aluno.id}
                style={[
                  styles.alunoOption,
                  alunoSelecionado?.id === aluno.id && styles.alunoOptionSelected,
                ]}
                onPress={() => setAlunoSelecionado(aluno)}
              >
                <Text
                  style={[
                    styles.alunoOptionText,
                    alunoSelecionado?.id === aluno.id && styles.alunoOptionTextSelected,
                  ]}
                >
                  {aluno.nome} (Saldo: R$ {Number(aluno.saldo || 0).toFixed(2)})
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleComprarCombo}
                disabled={comprando}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  comboCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  promoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  promoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },
  comboName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  comboDesc: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#16A34A',
  },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  buyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
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
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '700',
    marginBottom: 16,
  },
  selectLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  alunoOption: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  alunoOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  alunoOptionText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  alunoOptionTextSelected: {
    color: '#2563EB',
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})