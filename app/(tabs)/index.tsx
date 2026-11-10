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
  RefreshControl,
  Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle, G } from 'react-native-svg'

interface ProdutoRanking {
  nome: string
  quantidade: number
  porcentagem: number
}

interface Dependente {
  id: string
  nome: string
  escola_nome: string
  turma?: string
  serie?: string
  turno?: string
  saldo: number
  total_entradas: number
  total_saidas: number
  top_produtos: ProdutoRanking[]
  avatar_url?: string | null
}

interface AlunoDB {
  id: string
  nome?: string
  escola_id?: string
  escola_nome?: string
  escola?: string
  turma?: string
  serie?: string
  grau?: string
  turno?: string
  saldo?: number
  saldo_atual?: number
  foto_url?: string
  avatar_url?: string
  foto?: string
  avatar?: string
}

export default function HomeScreen() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('Responsável')
  const [escolaUnidade, setEscolaUnidade] = useState<string>('Colégio Guri Sênior')
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingLogout, setLoadingLogout] = useState(false)
  const [showSaldo, setShowSaldo] = useState(true)

  const fetchData = async () => {
    try {
      setLoadingData(true)

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) return

      setUserEmail(user.email || null)
      const nameFromMeta = user.user_metadata?.full_name
      if (nameFromMeta) {
        setUserName(nameFromMeta.split(' ')[0])
      } else if (user.email) {
        setUserName(user.email.split('@')[0])
      }

      let alunosLista: AlunoDB[] = []

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
          const ids = vinculos.map((v: { aluno_id: string }) => v.aluno_id)
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

      const primeiroAluno = alunosLista[0]
      const escolaIdValido =
        primeiroAluno?.escola_id &&
        primeiroAluno.escola_id !== '00000000-0000-0000-0000-000000000000' &&
        primeiroAluno.escola_id !== '00000000-0000-0000-0000-000000000001'

      if (escolaIdValido) {
        try {
          const { data: escolaData } = await supabase
            .from('escolas')
            .select('nome')
            .eq('id', primeiroAluno.escola_id)
            .maybeSingle()

          if (escolaData?.nome) {
            setEscolaUnidade(escolaData.nome)
          }
        } catch (e) {
          console.log('Consulta à tabela escolas ignorada:', e)
        }
      } else if (primeiroAluno?.escola_nome || primeiroAluno?.escola) {
        setEscolaUnidade(primeiroAluno.escola_nome || primeiroAluno.escola || 'Colégio Cantina')
      }

      const alunoIds = alunosLista.map((a) => a.id)

      const carteirasMap: Record<string, { saldo: number }> = {}
      try {
        const { data: carteirasData } = await supabase
          .from('carteiras')
          .select('*')
          .in('aluno_id', alunoIds)

        if (carteirasData) {
          carteirasData.forEach((c: { aluno_id: string; saldo?: number; saldo_dinheiro?: number; saldo_atual?: number; valor?: number }) => {
            const valSaldo = Number(c.saldo ?? c.saldo_dinheiro ?? c.saldo_atual ?? c.valor ?? 0)
            carteirasMap[String(c.aluno_id)] = { saldo: valSaldo }
          })
        }
      } catch (e) {
        console.log('Erro ao consultar carteiras:', e)
      }

      const totalEntradasMap: Record<string, number> = {}
      const totalSaidasMap: Record<string, number> = {}
      const itensContagemMap: Record<string, Record<string, number>> = {}

      try {
        const { data: pedidosData } = await supabase
          .from('pedidos')
          .select('aluno_id, valor_total, total, valor, itens_pedido(*, produtos(nome))')
          .in('aluno_id', alunoIds)

        if (pedidosData) {
          pedidosData.forEach((p: { aluno_id: string; valor_total?: number; total?: number; valor?: number; itens_pedido?: Array<{ produtos?: { nome?: string }; nome?: string; quantidade?: number }> }) => {
            const aid = String(p.aluno_id)
            const val = Number(p.valor_total ?? p.total ?? p.valor ?? 0)

            totalSaidasMap[aid] = (totalSaidasMap[aid] || 0) + val

            if (!itensContagemMap[aid]) itensContagemMap[aid] = {}

            if (Array.isArray(p.itens_pedido) && p.itens_pedido.length > 0) {
              p.itens_pedido.forEach((ip) => {
                const nomeItem = ip.produtos?.nome || ip.nome || 'Lanche Cantina'
                const qtd = Number(ip.quantidade ?? 1)
                itensContagemMap[aid][nomeItem] = (itensContagemMap[aid][nomeItem] || 0) + qtd
              })
            }
          })
        }
      } catch (e) {
        console.log('Erro ao consultar pedidos:', e)
      }

      try {
        const { data: recargasData } = await supabase
          .from('transacoes')
          .select('aluno_id, valor, tipo')
          .in('aluno_id', alunoIds)

        if (recargasData) {
          recargasData.forEach((t: { aluno_id: string; valor?: number; tipo?: string }) => {
            const aid = String(t.aluno_id)
            const val = Number(t.valor ?? 0)
            if (t.tipo === 'recarga' || t.tipo === 'entrada' || val > 0) {
              totalEntradasMap[aid] = (totalEntradasMap[aid] || 0) + val
            }
          })
        }
      } catch (e) {
        console.log('Erro ao consultar transacoes:', e)
      }

      const mapeados: Dependente[] = alunosLista.map((a) => {
        const aid = String(a.id)

        const infoCarteira = carteirasMap[aid]
        const saldoFinal =
          infoCarteira && infoCarteira.saldo !== undefined
            ? infoCarteira.saldo
            : Number(a.saldo ?? a.saldo_atual ?? 0)

        const saidas = totalSaidasMap[aid] || 0
        const entradas = totalEntradasMap[aid] || (saldoFinal + saidas)

        const mapaItens = itensContagemMap[aid] || {}
        const listaOrdenada = Object.entries(mapaItens)
          .map(([nome, quantidade]) => ({ nome, quantidade }))
          .sort((x, y) => y.quantidade - x.quantidade)
          .slice(0, 5)

        const maxQtd = listaOrdenada.length > 0 ? listaOrdenada[0].quantidade : 1
        const topProdutosFormatados: ProdutoRanking[] = listaOrdenada.map((item) => ({
          nome: item.nome,
          quantidade: item.quantidade,
          porcentagem: Math.round((item.quantidade / maxQtd) * 100),
        }))

        const foto = a.foto_url || a.avatar_url || a.foto || a.avatar || null

        return {
          id: aid,
          nome: a.nome || 'Aluno',
          escola_nome: escolaUnidade,
          turma: a.turma || 'Turma A',
          serie: a.serie || a.grau || 'Fundamental',
          turno: a.turno || 'Manhã',
          saldo: saldoFinal,
          total_entradas: entradas,
          total_saidas: saidas,
          top_produtos: topProdutosFormatados || [],
          avatar_url: foto,
        }
      })

      setDependentes(mapeados)
      if (mapeados.length > 0 && !alunoSelecionado) {
        setAlunoSelecionado(mapeados[0])
      }
    } catch (err) {
      console.error('Erro ao buscar dados no Supabase:', err)
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchData()
  }, [])

  const saldoTotal = dependentes.reduce((acc, item) => acc + (item.saldo || 0), 0)

  const handleLogout = async () => {
    setLoadingLogout(true)
    try {
      await supabase.auth.signOut()
      router.replace('/(auth)' as any)
    } catch (err: unknown) {
      console.error('Erro no logout:', err)
      setLoadingLogout(false)
      if (Platform.OS !== 'web') {
        Alert.alert('Erro', 'Não foi possível encerrar a sessão.')
      }
    }
  }

  const navegarPara = (rota: string) => {
    try {
      router.push(rota as any)
    } catch (error) {
      console.warn('Erro ao navegar:', error)
    }
  }

  const entradasVal = alunoSelecionado?.total_entradas || 0
  const saidasVal = alunoSelecionado?.total_saidas || 0

  const pctSaida = entradasVal > 0 
    ? Math.min(Math.round((saidasVal / entradasVal) * 100), 100) 
    : 0

  const size = 100
  const strokeWidth = 12
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (circumference * pctSaida) / 100

  const topProdutosSeguros = alunoSelecionado?.top_produtos || []

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2B6CB0']} />
      }
    >
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarInitial}>{userName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, paddingRight: 6 }}>
            <Text style={styles.greeting} numberOfLines={1}>Olá, {userName} 👋</Text>
            <Text style={styles.userSubtext} numberOfLines={1}>{userEmail || 'Sessão Ativa'}</Text>

            <View style={styles.schoolHeaderBadge}>
              <Ionicons name="school-outline" size={11} color="#2563EB" />
              <Text style={styles.schoolHeaderBadgeText} numberOfLines={1}>
                {escolaUnidade}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loadingLogout}>
          {loadingLogout ? (
            <ActivityIndicator size="small" color="#E11D48" />
          ) : (
            <Ionicons name="log-out-outline" size={20} color="#E11D48" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>SALDO TOTAL DISPONÍVEL</Text>
          <TouchableOpacity onPress={() => setShowSaldo(!showSaldo)}>
            <Ionicons name={showSaldo ? 'eye-outline' : 'eye-off-outline'} size={20} color="#BFDBFE" />
          </TouchableOpacity>
        </View>

        <Text style={styles.balanceAmount}>
          {showSaldo ? `R$ ${saldoTotal.toFixed(2).replace('.', ',')}` : 'R$ ••••'}
        </Text>

        <TouchableOpacity
          style={styles.rechargeMainButton}
          onPress={() => navegarPara('/(tabs)/recarregar')}
          activeOpacity={0.85}
        >
          <Ionicons name="flash" size={18} color="#FFFFFF" />
          <Text style={styles.rechargeMainText}>RECARREGAR AGORA VIA PIX</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Ações Rápidas</Text>
      <View style={styles.quickActionsContainer}>
        <TouchableOpacity style={styles.actionItem} onPress={() => navegarPara('/(tabs)/dependentes')}>
          <View style={[styles.actionIconBadge, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="people-outline" size={20} color="#16A34A" />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>Alunos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => navegarPara('/(tabs)/combo')}>
          <View style={[styles.actionIconBadge, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="fast-food-outline" size={20} color="#2563EB" />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>Combos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => navegarPara('/(tabs)/pedidos')}>
          <View style={[styles.actionIconBadge, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="receipt-outline" size={20} color="#EA580C" />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>Pedidos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => navegarPara('/(tabs)/recarregar')}>
          <View style={[styles.actionIconBadge, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="wallet-outline" size={20} color="#16A34A" />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>Recarga</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => navegarPara('/(tabs)/cartoes')}>
          <View style={[styles.actionIconBadge, { backgroundColor: '#FAF5FF' }]}>
            <Ionicons name="card-outline" size={20} color="#9333EA" />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>Cartões</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Meus Dependentes ({dependentes.length})</Text>
        <TouchableOpacity onPress={() => navegarPara('/(tabs)/dependentes')}>
          <Text style={styles.seeAllText}>Ver todos</Text>
        </TouchableOpacity>
      </View>

      {loadingData ? (
        <ActivityIndicator size="small" color="#2B6CB0" style={{ marginVertical: 20 }} />
      ) : dependentes.length > 0 ? (
        <>
          <View style={styles.depCardsRow}>
            {dependentes.map((dep) => {
              const isSelected = alunoSelecionado?.id === dep.id
              return (
                <TouchableOpacity
                  key={dep.id}
                  style={[styles.smallDepCard, isSelected && styles.smallDepCardSelected]}
                  activeOpacity={0.88}
                  onPress={() => setAlunoSelecionado(dep)}
                >
                  <View style={styles.smallCardTop}>
                    {dep.avatar_url ? (
                      <Image source={{ uri: dep.avatar_url }} style={styles.smallAvatarImage} />
                    ) : (
                      <View style={[styles.smallAvatarBadge, isSelected && styles.smallAvatarBadgeSelected]}>
                        <Text style={[styles.smallAvatarText, isSelected && styles.smallAvatarTextSelected]}>
                          {dep.nome.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={styles.statusDotActive} />
                  </View>

                  <Text style={[styles.smallDepName, isSelected && styles.smallDepNameSelected]} numberOfLines={1}>
                    {dep.nome}
                  </Text>

                  <Text style={[styles.smallDepInfo, isSelected && styles.smallDepInfoSelected]} numberOfLines={1}>
                    {dep.serie} • {dep.turno}
                  </Text>

                  <View style={styles.smallCardFooter}>
                    <Text style={[styles.smallDepSaldoLabel, isSelected && styles.smallDepSaldoLabelSelected]}>
                      Saldo
                    </Text>
                    <Text style={[styles.smallDepSaldoValue, isSelected && styles.smallDepSaldoValueSelected]}>
                      {showSaldo ? `R$ ${dep.saldo.toFixed(2).replace('.', ',')}` : 'R$ •••'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>

          {alunoSelecionado && (
            <View style={styles.dualStatsCard}>
              <View style={styles.statsHeaderRow}>
                <Ionicons name="pie-chart-outline" size={18} color="#2563EB" />
                <Text style={styles.statsPanelTitle}>
                  Análise do Aluno: <Text style={{ fontWeight: '800' }}>{alunoSelecionado.nome.split(' ')[0]}</Text>
                </Text>
              </View>

              <View style={styles.dualColumnsWrapper}>
                <View style={styles.leftPieColumn}>
                  <Text style={styles.columnTitle}>Entradas x Saídas</Text>
                  <View style={styles.pieContainer}>
                    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                      <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                        <Circle
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          stroke="#16A34A"
                          strokeWidth={strokeWidth}
                          fill="transparent"
                        />
                        <Circle
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          stroke="#E11D48"
                          strokeWidth={strokeWidth}
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="transparent"
                        />
                      </G>
                    </Svg>
                    <View style={styles.pieCenterText}>
                      <Text style={styles.piePercentText}>{pctSaida}%</Text>
                      <Text style={styles.pieSubText}>usado</Text>
                    </View>
                  </View>

                  <View style={styles.legendContainer}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#16A34A' }]} />
                      <Text style={styles.legendLabel}>
                        Entradas: <Text style={{ fontWeight: '800' }}>R$ {entradasVal.toFixed(2)}</Text>
                      </Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#E11D48' }]} />
                      <Text style={styles.legendLabel}>
                        Saídas: <Text style={{ fontWeight: '800' }}>R$ {saidasVal.toFixed(2)}</Text>
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.verticalDivider} />

                <View style={styles.rightBarsColumn}>
                  <Text style={styles.columnTitle}>Top 5 Itens Mais Pedidos</Text>

                  {topProdutosSeguros.length > 0 ? (
                    topProdutosSeguros.map((prod, idx) => (
                      <View key={idx} style={styles.barItemRow}>
                        <View style={styles.barItemInfo}>
                          <Text style={styles.barItemName} numberOfLines={1}>
                            {idx + 1}. {prod.nome}
                          </Text>
                          <Text style={styles.barItemQty}>{prod.quantidade}x</Text>
                        </View>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${prod.porcentagem}%` }]} />
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyItemsBox}>
                      <Ionicons name="fast-food-outline" size={22} color="#94A3B8" />
                      <Text style={styles.emptyItemsText}>Nenhum item consumido ainda.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="people-circle-outline" size={36} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Nenhum aluno encontrado</Text>
          <Text style={styles.emptySub}>Vincule seus filhos para acompanhar o saldo e consumo.</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navegarPara('/(tabs)/dependentes')}
          >
            <Text style={styles.emptyButtonText}>Adicionar Aluno</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.infoBanner}>
        <Ionicons name="nutrition-outline" size={26} color="#F27835" />
        <View style={styles.infoBannerTextContainer}>
          <Text style={styles.infoBannerTitle}>Cardápio do Dia Disponível</Text>
          <Text style={styles.infoBannerSub}>Acompanhe o consumo diário e defina limites de compra.</Text>
        </View>
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2B6CB0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  greeting: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  userSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  schoolHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
    maxWidth: 180,
  },
  schoolHeaderBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  logoutButton: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  balanceCard: {
    backgroundColor: '#2B6CB0',
    borderRadius: 20,
    padding: 22,
    marginBottom: 24,
    elevation: 4,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 0.8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    marginVertical: 12,
  },
  rechargeMainButton: {
    flexDirection: 'row',
    backgroundColor: '#F27835',
    borderRadius: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  rechargeMainText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2B6CB0',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 24,
  },
  actionItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  depCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  smallDepCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  smallDepCardSelected: {
    backgroundColor: '#2B6CB0',
    borderColor: '#2B6CB0',
  },
  smallCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  smallAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  smallAvatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  smallAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2B6CB0',
  },
  smallAvatarTextSelected: {
    color: '#FFFFFF',
  },
  statusDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  smallDepName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  smallDepNameSelected: {
    color: '#FFFFFF',
  },
  smallDepInfo: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  smallDepInfoSelected: {
    color: '#BFDBFE',
  },
  smallCardFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  smallDepSaldoLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
  },
  smallDepSaldoLabelSelected: {
    color: '#BFDBFE',
  },
  smallDepSaldoValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#16A34A',
    marginTop: 1,
  },
  smallDepSaldoValueSelected: {
    color: '#FFFFFF',
  },
  dualStatsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  statsPanelTitle: {
    fontSize: 13,
    color: '#0F172A',
  },
  dualColumnsWrapper: {
    flexDirection: 'row',
    gap: 12,
  },
  leftPieColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
  },
  pieContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieCenterText: {
    position: 'absolute',
    alignItems: 'center',
  },
  piePercentText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  pieSubText: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
  },
  legendContainer: {
    marginTop: 10,
    gap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 9,
    color: '#475569',
  },
  verticalDivider: {
    width: 1,
    backgroundColor: '#F1F5F9',
  },
  rightBarsColumn: {
    flex: 1.3,
  },
  barItemRow: {
    marginBottom: 8,
  },
  barItemInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  barItemName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  barItemQty: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
    marginLeft: 4,
  },
  barTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  emptyItemsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  emptyItemsText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  emptyButton: {
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emptyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2B6CB0',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    marginBottom: 40,
    gap: 12,
  },
  infoBannerTextContainer: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9A3412',
  },
  infoBannerSub: {
    fontSize: 11,
    color: '#C2410C',
    marginTop: 2,
  },
})