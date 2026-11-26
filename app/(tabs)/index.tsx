import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Image,
  StatusBar,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  matricula?: string
  escola_nome: string
  turma?: string
  serie?: string
  turno?: string
  saldo: number
  limite_diario?: number
  bloqueado: boolean
  is_self?: boolean
  total_entradas: number
  total_saidas: number
  top_produtos: ProdutoRanking[]
  avatar_url?: string | null
}

interface AlunoDB {
  id: string
  nome?: string
  matricula?: string
  escola_id?: string
  escola_nome?: string
  escola?: string
  turma?: string
  serie?: string
  grau?: string
  turno?: string
  saldo?: number
  saldo_atual?: number
  limite_diario?: number
  bloqueado?: boolean
  cartao_bloqueado?: boolean
  is_self?: boolean
  foto_url?: string
  foto_facial_url?: string
  avatar_url?: string
  foto?: string
  avatar?: string
}

const LIMIAR_SALDO_BAIXO = 5

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('Responsável')
  const [escolaUnidade, setEscolaUnidade] = useState<string>('Unidade Escolar')
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingLogout, setLoadingLogout] = useState(false)
  const [showSaldo, setShowSaldo] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        router.replace('/' as any)
        return
      }

      setUserEmail(user.email || null)

      // 1. Busca perfil (apenas colunas existentes: id e nome)
      const { data: perfil } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('id', user.id)
        .maybeSingle()

      const responsavelId = perfil?.id || user.id
      let nameFromProfile =
        perfil?.nome || user.user_metadata?.nome || user.user_metadata?.full_name

      if (!nameFromProfile) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nome')
          .eq('id', user.id)
          .maybeSingle()
        nameFromProfile = usuario?.nome
      }

      if (nameFromProfile) {
        setUserName(String(nameFromProfile).trim().split(' ')[0])
      } else if (user.email) {
        setUserName(user.email.split('@')[0])
      }

      // 2. Busca alunos vinculados
      let alunosLista: AlunoDB[] = []

      const { data: diretos } = await supabase
        .from('alunos')
        .select('*')
        .eq('responsavel_id', responsavelId)
        .order('nome', { ascending: true })

      if (diretos && diretos.length > 0) {
        alunosLista = diretos as AlunoDB[]
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

          if (porIds) alunosLista = porIds as AlunoDB[]
        }
      }

      // 3. Resolve o nome real da escola buscando diretamente na tabela 'escola'
      let nomeEscolaResolvido = 'Unidade Escolar'
      const escolaDireta = alunosLista.find((a) => a.escola_nome || a.escola)

      if (escolaDireta) {
        nomeEscolaResolvido =
          escolaDireta.escola_nome || escolaDireta.escola || 'Unidade Escolar'
      } else {
        const escolaIdValido = alunosLista.find(
          (a) =>
            a.escola_id &&
            a.escola_id !== '00000000-0000-0000-0000-000000000000' &&
            a.escola_id !== '00000000-0000-0000-0000-000000000001'
        )?.escola_id

        if (escolaIdValido) {
          const { data: escolaData } = await supabase
            .from('escola')
            .select('nome')
            .eq('id', escolaIdValido)
            .maybeSingle()

          if (escolaData?.nome) {
            nomeEscolaResolvido = escolaData.nome
          }
        }

        // Fallback: caso o aluno não tenha escola_id ou seja ID padrão, pega o primeiro registro da tabela 'escola'
        if (nomeEscolaResolvido === 'Unidade Escolar') {
          const { data: primeiraEscola } = await supabase
            .from('escola')
            .select('nome')
            .limit(1)
            .maybeSingle()

          if (primeiraEscola?.nome) {
            nomeEscolaResolvido = primeiraEscola.nome
          }
        }
      }
      setEscolaUnidade(nomeEscolaResolvido)

      if (alunosLista.length === 0) {
        setDependentes([])
        setAlunoSelecionado(null)
        return
      }

      const alunoIds = alunosLista.map((a) => a.id)

      // 4. Carteiras (caso use tabela separada ou coluna saldo direto em alunos)
      const carteirasMap: Record<string, { saldo: number; bloqueado: boolean }> = {}
      try {
        const { data: carteirasData } = await supabase
          .from('carteiras')
          .select('*')
          .in('aluno_id', alunoIds)

        if (carteirasData) {
          carteirasData.forEach((c: any) => {
            const valSaldo = Number(
              c.saldo ?? c.saldo_dinheiro ?? c.saldo_atual ?? c.valor ?? 0
            )
            const isBloqueado = Boolean(c.bloqueado || c.status === 'bloqueado')
            carteirasMap[String(c.aluno_id)] = {
              saldo: valSaldo,
              bloqueado: isBloqueado,
            }
          })
        }
      } catch (e) {
        console.log('Consulta carteiras opcional:', e)
      }

      // 5. Pedidos e Top 5 itens consumidos
      const totalEntradasMap: Record<string, number> = {}
      const totalSaidasMap: Record<string, number> = {}
      const itensContagemMap: Record<string, Record<string, number>> = {}

      try {
        const { data: pedidosData } = await supabase
          .from('pedidos')
          .select('aluno_id, valor_total, total, valor, status, itens_pedido(*, produtos(nome))')
          .in('aluno_id', alunoIds)

        if (pedidosData) {
          pedidosData.forEach((p: any) => {
            if (p.status === 'CANCELADO' || p.status === 'cancelado') return
            const aid = String(p.aluno_id)
            const val = Number(p.valor_total ?? p.total ?? p.valor ?? 0)

            totalSaidasMap[aid] = (totalSaidasMap[aid] || 0) + val

            if (!itensContagemMap[aid]) itensContagemMap[aid] = {}

            if (Array.isArray(p.itens_pedido) && p.itens_pedido.length > 0) {
              p.itens_pedido.forEach((ip: any) => {
                const nomeItem = ip.produtos?.nome || ip.nome || 'Lanche Cantina'
                const qtd = Number(ip.quantidade ?? 1)
                itensContagemMap[aid][nomeItem] =
                  (itensContagemMap[aid][nomeItem] || 0) + qtd
              })
            }
          })
        }
      } catch (e) {
        console.log('Erro ao consultar pedidos:', e)
      }

      // 6. Transações (apenas colunas existentes: aluno_id, valor, tipo)
      try {
        const { data: transacoesData } = await supabase
          .from('transacoes')
          .select('aluno_id, valor, tipo')
          .in('aluno_id', alunoIds)

        if (transacoesData) {
          transacoesData.forEach((t: any) => {
            const aid = String(t.aluno_id)
            const val = Math.abs(Number(t.valor ?? 0))
            const tipoUpper = String(t.tipo || '').toUpperCase()

            if (tipoUpper === 'RECARGA' || tipoUpper === 'ENTRADA' || tipoUpper === 'ESTORNO') {
              totalEntradasMap[aid] = (totalEntradasMap[aid] || 0) + val
            } else if (tipoUpper === 'CONSUMO' && !totalSaidasMap[aid]) {
              totalSaidasMap[aid] = (totalSaidasMap[aid] || 0) + val
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

        const isBloqueado = Boolean(
          infoCarteira?.bloqueado || a.bloqueado === true || a.cartao_bloqueado === true
        )

        const saidas = totalSaidasMap[aid] || 0
        const entradas = totalEntradasMap[aid] || saldoFinal + saidas

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

        const foto =
          a.foto_facial_url || a.foto_url || a.avatar_url || a.foto || a.avatar || null

        return {
          id: aid,
          nome: a.nome || 'Aluno',
          matricula: a.matricula,
          escola_nome: a.escola_nome || a.escola || nomeEscolaResolvido,
          turma: a.turma || '',
          serie: a.serie || a.grau || (a.is_self ? 'Carteira Titular' : 'Aluno'),
          turno: a.turno || '',
          saldo: saldoFinal,
          limite_diario: Number(a.limite_diario || 0),
          bloqueado: isBloqueado,
          is_self: Boolean(a.is_self),
          total_entradas: entradas,
          total_saidas: saidas,
          top_produtos: topProdutosFormatados,
          avatar_url: foto,
        }
      })

      setDependentes(mapeados)
      setAlunoSelecionado((prev) =>
        prev ? mapeados.find((m) => m.id === prev.id) || mapeados[0] : mapeados[0]
      )
    } catch (err) {
      console.error('Erro ao buscar dados no Supabase:', err)
    } finally {
      setLoadingData(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchData()
  }, [fetchData])

  const saldoTotal = dependentes.reduce((acc, item) => acc + (item.saldo || 0), 0)
  const dependentesSaldoBaixo = dependentes.filter(
    (d) => Number(d.saldo || 0) < LIMIAR_SALDO_BAIXO
  )

  const handleLogout = async () => {
    if (loadingLogout) return
    setLoadingLogout(true)
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ])
    } catch (err) {
      console.warn('Aviso ao encerrar sessão:', err)
    } finally {
      setLoadingLogout(false)
      router.replace('/' as any)
    }
  }

  const navegarPara = (rota: string) => {
    const caminhoLimpo = rota.replace('/(tabs)', '') || '/'
    try {
      router.push(caminhoLimpo as any)
    } catch (error) {
      console.warn('Erro ao navegar:', error)
    }
  }

  const entradasVal = alunoSelecionado?.total_entradas || 0
  const saidasVal = alunoSelecionado?.total_saidas || 0

  const pctSaida =
    entradasVal > 0 ? Math.min(Math.round((saidasVal / entradasVal) * 100), 100) : 0

  const size = 100
  const strokeWidth = 12
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (circumference * pctSaida) / 100

  const topProdutosSeguros = alunoSelecionado?.top_produtos || []

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1E62D0']}
            tintColor="#FFFFFF"
          />
        }
      >
        {/* Topo Institucional Azul-Marinho */}
        <View
          style={[
            styles.topNavySection,
            { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 20 : 40) + 6 },
          ]}
        >
          <View style={styles.topAccentCircle} />

          {/* Cabeçalho do Responsável */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              <View style={styles.avatarBadge}>
                <Text style={styles.avatarInitial}>{userName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Text style={styles.greeting} numberOfLines={1}>
                  Olá, {userName}
                </Text>
                <Text style={styles.userSubtext} numberOfLines={1}>
                  {userEmail || 'Portal da Família'}
                </Text>

                <View style={styles.schoolHeaderBadge}>
                  <Ionicons name="school-outline" size={11} color="#FFFFFF" />
                  <Text style={styles.schoolHeaderBadgeText} numberOfLines={1}>
                    {escolaUnidade}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              disabled={loadingLogout}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {loadingLogout ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Cartão de Saldo Consolidado */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <View style={styles.balanceTag}>
                <Text style={styles.balanceTagText}>CARTEIRA FAMILIAR</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSaldo(!showSaldo)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showSaldo ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#DBEAFE"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.balanceLabel}>SALDO TOTAL DISPONÍVEL</Text>
            <Text style={styles.balanceAmount}>
              {showSaldo ? `R$ ${saldoTotal.toFixed(2).replace('.', ',')}` : 'R$ •••••'}
            </Text>

            <TouchableOpacity
              style={styles.rechargeMainButton}
              onPress={() => navegarPara('/recarregar')}
              activeOpacity={0.85}
            >
              <Ionicons name="flash" size={16} color="#FFFFFF" />
              <Text style={styles.rechargeMainText}>RECARREGAR AGORA VIA PIX</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Área Principal Branca Arredondada */}
        <View style={styles.bodySheet}>
          {/* Alerta Preventivo de Saldo Baixo */}
          {!loadingData && dependentesSaldoBaixo.length > 0 && (
            <TouchableOpacity
              style={styles.lowBalanceBanner}
              onPress={() => navegarPara('/recarregar')}
              activeOpacity={0.85}
            >
              <View style={styles.lowBalanceIcon}>
                <Ionicons name="warning" size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lowBalanceTitle}>
                  Atenção ao saldo para o próximo intervalo
                </Text>
                <Text style={styles.lowBalanceSub}>
                  {dependentesSaldoBaixo.length === 1
                    ? `${dependentesSaldoBaixo[0].nome.split(' ')[0]} está com saldo de R$ ${dependentesSaldoBaixo[0].saldo.toFixed(2).replace('.', ',')}.`
                    : `${dependentesSaldoBaixo.length} dependentes estão com saldo abaixo de R$ 5,00.`}
                </Text>
              </View>
              <View style={styles.lowBalanceBtn}>
                <Text style={styles.lowBalanceBtnText}>RECARREGAR</Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>Ações Rápidas</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navegarPara('/dependentes')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="people-outline" size={20} color="#16A34A" />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>
                Alunos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navegarPara('/combo')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="fast-food-outline" size={20} color="#1E62D0" />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>
                Combos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navegarPara('/almoco')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="restaurant-outline" size={20} color="#F27835" />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>
                Almoço
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navegarPara('/pedidos')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="receipt-outline" size={20} color="#F27835" />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>
                Pedidos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navegarPara('/recarregar')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="wallet-outline" size={20} color="#16A34A" />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>
                Recarga
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navegarPara('/cartoes')}
              activeOpacity={0.85}
            >
              <View style={[styles.actionIconBadge, { backgroundColor: '#FAF5FF' }]}>
                <Ionicons name="card-outline" size={20} color="#9333EA" />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>
                Cartões
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
              Meus Dependentes ({dependentes.length})
            </Text>
            <TouchableOpacity onPress={() => navegarPara('/dependentes')}>
              <Text style={styles.seeAllText}>Gerenciar</Text>
            </TouchableOpacity>
          </View>

          {loadingData ? (
            <ActivityIndicator size="small" color="#1E62D0" style={{ marginVertical: 24 }} />
          ) : dependentes.length > 0 ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.depCardsRow}
              >
                {dependentes.map((dep) => {
                  const isSelected = alunoSelecionado?.id === dep.id
                  const detalhes = [dep.serie, dep.turno].filter(Boolean).join(' • ')

                  return (
                    <TouchableOpacity
                      key={dep.id}
                      style={[styles.smallDepCard, isSelected && styles.smallDepCardSelected]}
                      activeOpacity={0.88}
                      onPress={() => setAlunoSelecionado(dep)}
                    >
                      <View style={styles.smallCardTop}>
                        {dep.avatar_url ? (
                          <Image
                            source={{ uri: dep.avatar_url }}
                            style={styles.smallAvatarImage}
                          />
                        ) : (
                          <View
                            style={[
                              styles.smallAvatarBadge,
                              isSelected && styles.smallAvatarBadgeSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.smallAvatarText,
                                isSelected && styles.smallAvatarTextSelected,
                              ]}
                            >
                              {dep.nome.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}

                        <View
                          style={[
                            styles.statusDotActive,
                            dep.bloqueado && { backgroundColor: '#EF4444' },
                          ]}
                        />
                      </View>

                      <Text
                        style={[styles.smallDepName, isSelected && styles.smallDepNameSelected]}
                        numberOfLines={1}
                      >
                        {dep.nome}
                      </Text>

                      <Text
                        style={[styles.smallDepInfo, isSelected && styles.smallDepInfoSelected]}
                        numberOfLines={1}
                      >
                        {detalhes || 'Aluno Vinculado'}
                      </Text>

                      <View
                        style={[
                          styles.smallCardFooter,
                          isSelected && { borderTopColor: 'rgba(255,255,255,0.18)' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.smallDepSaldoLabel,
                            isSelected && styles.smallDepSaldoLabelSelected,
                          ]}
                        >
                          {dep.bloqueado ? 'Cartão Bloqueado' : 'Saldo Disponível'}
                        </Text>
                        <Text
                          style={[
                            styles.smallDepSaldoValue,
                            isSelected && styles.smallDepSaldoValueSelected,
                          ]}
                        >
                          {showSaldo ? `R$ ${dep.saldo.toFixed(2).replace('.', ',')}` : 'R$ •••'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {alunoSelecionado && (
                <View style={styles.dualStatsCard}>
                  <View style={styles.statsHeaderRow}>
                    <Ionicons name="pie-chart-outline" size={18} color="#1E62D0" />
                    <Text style={styles.statsPanelTitle}>
                      Consumo de{' '}
                      <Text style={{ fontWeight: '800' }}>
                        {alunoSelecionado.nome.split(' ')[0]}
                      </Text>
                    </Text>
                  </View>

                  <View style={styles.dualColumnsWrapper}>
                    <View style={styles.leftPieColumn}>
                      <Text style={styles.columnTitle}>Entradas × Saídas</Text>
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
                            Entradas:{' '}
                            <Text style={{ fontWeight: '800' }}>
                              R$ {entradasVal.toFixed(2).replace('.', ',')}
                            </Text>
                          </Text>
                        </View>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: '#E11D48' }]} />
                          <Text style={styles.legendLabel}>
                            Saídas:{' '}
                            <Text style={{ fontWeight: '800' }}>
                              R$ {saidasVal.toFixed(2).replace('.', ',')}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.verticalDivider} />

                    <View style={styles.rightBarsColumn}>
                      <Text style={styles.columnTitle}>Top 5 Mais Pedidos</Text>

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
                              <View
                                style={[styles.barFill, { width: `${prod.porcentagem}%` }]}
                              />
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
              <Ionicons name="people-circle-outline" size={38} color="#1E62D0" />
              <Text style={styles.emptyTitle}>Nenhum aluno vinculado</Text>
              <Text style={styles.emptySub}>
                Cadastre ou vincule seus filhos para acompanhar o saldo, bloqueios e consumo.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navegarPara('/dependentes')}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyButtonText}>GERENCIAR ALUNOS</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Banner Informativo */}
          <TouchableOpacity
            style={styles.infoBanner}
            onPress={() => navegarPara('/combo')}
            activeOpacity={0.85}
          >
            <View style={styles.infoBannerIcon}>
              <Ionicons name="nutrition" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.infoBannerTextContainer}>
              <Text style={styles.infoBannerTitle}>Combos & Cardápio Escolar</Text>
              <Text style={styles.infoBannerSub}>
                Confira os pacotes promocionais e agende lanches com antecedência.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C2410C" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#1E2B58',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topNavySection: {
    backgroundColor: '#1E2B58',
    paddingHorizontal: 20,
    paddingBottom: 28,
    position: 'relative',
    overflow: 'hidden',
  },
  topAccentCircle: {
    position: 'absolute',
    right: -60,
    top: -40,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#2853A4',
    opacity: 0.45,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E62D0',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  greeting: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userSubtext: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 1,
  },
  schoolHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 5,
    alignSelf: 'flex-start',
    maxWidth: 240,
  },
  schoolHeaderBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  logoutButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 22,
    padding: 20,
    zIndex: 1,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  balanceTag: {
    backgroundColor: '#F27835',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  balanceTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#BFDBFE',
    letterSpacing: 0.8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
    marginBottom: 14,
  },
  rechargeMainButton: {
    flexDirection: 'row',
    backgroundColor: '#1E62D0',
    borderRadius: 999,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  rechargeMainText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  bodySheet: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -16,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  lowBalanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 12,
    marginBottom: 18,
    gap: 10,
  },
  lowBalanceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lowBalanceTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#78350F',
  },
  lowBalanceSub: {
    fontSize: 10,
    color: '#92400E',
    marginTop: 1,
  },
  lowBalanceBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  lowBalanceBtnText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E62D0',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 22,
  },
  actionItem: {
    width: '31.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  depCardsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 20,
    marginBottom: 16,
  },
  smallDepCard: {
    width: 175,
    maxWidth: 175,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  smallDepCardSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  smallCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  smallAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  smallAvatarBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  smallAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E62D0',
  },
  smallAvatarTextSelected: {
    color: '#FFFFFF',
  },
  statusDotActive: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#16A34A',
  },
  smallDepName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  smallDepNameSelected: {
    color: '#FFFFFF',
  },
  smallDepInfo: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  smallDepInfoSelected: {
    color: '#DBEAFE',
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
    color: '#DBEAFE',
  },
  smallDepSaldoValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A',
    marginTop: 1,
  },
  smallDepSaldoValueSelected: {
    color: '#FFFFFF',
  },
  dualStatsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  statsPanelTitle: {
    fontSize: 13,
    color: '#1E293B',
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
    color: '#1E293B',
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
    color: '#1E62D0',
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
    backgroundColor: '#1E62D0',
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
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 18,
  },
  emptyButton: {
    backgroundColor: '#1E62D0',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  emptyButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 18,
    padding: 14,
    marginTop: 4,
    gap: 12,
  },
  infoBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F27835',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBannerTextContainer: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9A3412',
  },
  infoBannerSub: {
    fontSize: 11,
    color: '#C2410C',
    marginTop: 2,
  },
})