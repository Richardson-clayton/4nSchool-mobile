import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface CartaoAluno {
  id: string
  aluno_nome: string
  turma?: string
  codigo_rfid: string
  status: string
  saldo: number
}

export default function CartoesScreen() {
  const router = useRouter()
  const [cartoes, setCartoes] = useState<CartaoAluno[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchCartoes = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: alunosData } = await supabase
        .from('alunos')
        .select('id, nome, turma, saldo')
        .eq('responsavel_id', user.id)

      if (alunosData && alunosData.length > 0) {
        const alunoIds = alunosData.map((a) => a.id)

        const { data: carteirasData } = await supabase
          .from('carteiras')
          .select('*')
          .in('aluno_id', alunoIds)

        const listaMapeada: CartaoAluno[] = alunosData.map((aluno) => {
          const carteira = carteirasData?.find((c: { aluno_id: string }) => String(c.aluno_id) === String(aluno.id))
          const rfid = carteira?.codigo_rfid || carteira?.rfid || carteira?.nfc_id || 'Não vinculado'

          return {
            id: carteira?.id || aluno.id,
            aluno_nome: aluno.nome,
            turma: aluno.turma || 'Sem turma',
            codigo_rfid: String(rfid),
            status: rfid !== 'Não vinculado' ? 'Ativo' : 'Pendente',
            saldo: Number(aluno.saldo || 0),
          }
        })

        setCartoes(listaMapeada)
      } else {
        setCartoes([])
      }
    } catch (err) {
      console.error('Erro ao carregar cartões:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchCartoes()
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    fetchCartoes()
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9333EA']} />}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cartões & RFID</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#9333EA" style={{ marginTop: 40 }} />
      ) : cartoes.length > 0 ? (
        cartoes.map((item) => (
          <View key={item.id} style={styles.cardContainer}>
            <View style={styles.cardTopRow}>
              <View style={styles.chipIcon}>
                <Ionicons name="hardware-chip-outline" size={24} color="#FFFFFF" />
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: item.status === 'Ativo' ? '#22C55E' : '#F59E0B' },
                ]}
              >
                <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.cardMiddleRow}>
              <Text style={styles.alunoName}>{item.aluno_nome}</Text>
              <Text style={styles.turmaText}>{item.turma}</Text>
            </View>

            <View style={styles.cardFooter}>
              <View>
                <Text style={styles.labelRfid}>CÓDIGO RFID / CARTÃO</Text>
                <Text style={styles.rfidCode}>{item.codigo_rfid}</Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.labelRfid}>SALDO</Text>
                <Text style={styles.saldoValue}>R$ {item.saldo.toFixed(2).replace('.', ',')}</Text>
              </View>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="card-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Nenhum Cartão Cadastrado</Text>
          <Text style={styles.emptySub}>Vincule os seus alunos para visualizar os seus cartões virtuais ou RFID.</Text>
        </View>
      )}
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
  cardContainer: {
    backgroundColor: '#6B21A8',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chipIcon: {
    width: 40,
    height: 30,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  cardMiddleRow: {
    marginBottom: 20,
  },
  alunoName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  turmaText: {
    color: '#E9D5FF',
    fontSize: 12,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 12,
  },
  labelRfid: {
    color: '#D8B4FE',
    fontSize: 9,
    fontWeight: '800',
  },
  rfidCode: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  saldoValue: {
    color: '#4ADE80',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
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
    textAlign: 'center',
    marginTop: 4,
  },
})