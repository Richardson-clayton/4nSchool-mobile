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
  Modal,
  Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface Dependente {
  id: string
  nome: string
  turma?: string
  serie?: string
  turno?: string
  saldo: number
  limite_diario: number
  gasto_hoje: number
  gasto_mes: number
  avatar_url?: string | null
  status?: string
}

interface ItemComprado {
  nome: string
  quantidade: number
  preco_unitario: number
}

interface CompraRecente {
  id: string
  data: string
  itens: ItemComprado[]
  valor_total: number
}

interface Restricao {
  id: string
  nome: string
  ativo: boolean
  icone: string
}

export default function DependentesScreen() {
  const router = useRouter()
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [ultimasCompras, setUltimasCompras] = useState<CompraRecente[]>([])

  const [modalLimiteVisible, setModalLimiteVisible] = useState(false)
  const [novoLimite, setNovoLimite] = useState<string>('')
  const [salvandoLimite, setSalvandoLimite] = useState(false)

  const [modalEditarVisible, setModalEditarVisible] = useState(false)
  const [editNome, setEditNome] = useState('')
  const [editTurma, setEditTurma] = useState('')
  const [editSerie, setEditSerie] = useState('')
  const [editTurno, setEditTurno] = useState('')
  const [salvandoCadastro, setSalvandoCadastro] = useState(false)

  const [modalRestricoesVisible, setModalRestricoesVisible] = useState(false)
  const [restricoes, setRestricoes] = useState<Restricao[]>([
    { id: '1', nome: 'Lactose / Derivados de Leite', ativo: false, icone: 'nutrition-outline' },
    { id: '2', nome: 'Glúten', ativo: false, icone: 'cafe-outline' },
    { id: '3', nome: 'Refrigerantes & Industrializados', ativo: true, icone: 'beaker-outline' },
    { id: '4', nome: 'Doces & Chocolates em excesso', ativo: true, icone: 'ice-cream-outline' },
    { id: '5', nome: 'Amendoim & Oleaginosas', ativo: false, icone: 'alert-circle-outline' },
  ])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDados = async () => {
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

      let carteirasMap: Record<string, { saldo: number; limite_diario: number }> = {}
      try {
        const { data: carteirasData } = await supabase
          .from('carteiras')
          .select('*')
          .in('aluno_id', alunoIds)

        if (carteirasData) {
          carteirasData.forEach((c: any) => {
            const valSaldo = Number(c.saldo ?? c.saldo_dinheiro ?? c.saldo_atual ?? c.valor ?? 0)
            const valLimite = Number(c.limite_diario ?? c.limite ?? 30.0)
            carteirasMap[String(c.aluno_id)] = { saldo: valSaldo, limite_diario: valLimite }
          })
        }
      } catch (e) {
        console.log('Erro ao consultar carteiras:', e)
      }

      const hojeIso = new Date().toISOString().split('T')[0]
      const primeiroDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

      let gastosHojeMap: Record<string, number> = {}
      let gastosMesMap: Record<string, number> = {}

      try {
        const { data: pedidosMes } = await supabase
          .from('pedidos')
          .select('aluno_id, valor_total, total, valor, created_at')
          .in('aluno_id', alunoIds)
          .gte('created_at', primeiroDiaMes)

        if (pedidosMes) {
          pedidosMes.forEach((p: any) => {
            const aid = String(p.aluno_id)
            const val = Number(p.valor_total ?? p.total ?? p.valor ?? 0)
            gastosMesMap[aid] = (gastosMesMap[aid] || 0) + val

            if (p.created_at && p.created_at.startsWith(hojeIso)) {
              gastosHojeMap[aid] = (gastosHojeMap[aid] || 0) + val
            }
          })
        }
      } catch (e) {
        console.log('Erro ao consultar pedidos do aluno:', e)
      }

      const mapeados: Dependente[] = alunosLista.map((a: any) => {
        const aid = String(a.id)

        const infoCarteira = carteirasMap[aid]
        const saldoFinal =
          infoCarteira && infoCarteira.saldo !== undefined
            ? infoCarteira.saldo
            : Number(a.saldo ?? a.saldo_atual ?? 0)

        const limiteFinal =
          infoCarteira && infoCarteira.limite_diario !== undefined
            ? infoCarteira.limite_diario
            : Number(a.limite_diario ?? a.limite ?? 30.0)

        const foto = a.foto_url || a.avatar_url || a.foto || a.avatar || null

        return {
          id: aid,
          nome: a.nome || 'Aluno',
          turma: a.turma || 'Turma A',
          serie: a.serie || a.grau || 'Fundamental',
          turno: a.turno || 'Manhã',
          saldo: saldoFinal,
          limite_diario: limiteFinal,
          gasto_hoje: gastosHojeMap[aid] || 0,
          gasto_mes: gastosMesMap[aid] || 0,
          avatar_url: foto,
          status: a.status || 'Ativo',
        }
      })

      setDependentes(mapeados)

      const atual = alunoSelecionado
        ? mapeados.find((m) => m.id === alunoSelecionado.id) || mapeados[0]
        : mapeados[0]

      if (atual) {
        setAlunoSelecionado(atual)
        setNovoLimite(atual.limite_diario ? String(atual.limite_diario) : '')
        fetchComprasDetalhadas(atual.id)
      }
    } catch (err) {
      console.error('Erro ao buscar dependentes:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchComprasDetalhadas = async (alunoId: string) => {
    try {
      const { data: pedidosData } = await supabase
        .from('pedidos')
        .select('*, itens_pedido(*, produtos(nome))')
        .eq('aluno_id', alunoId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (pedidosData && pedidosData.length > 0) {
        const formatados: CompraRecente[] = pedidosData.map((p: any) => {
          let listaItens: ItemComprado[] = []

          if (Array.isArray(p.itens_pedido) && p.itens_pedido.length > 0) {
            listaItens = p.itens_pedido.map((ip: any) => ({
              nome: ip.produtos?.nome || ip.nome || 'Item da Cantina',
              quantidade: Number(ip.quantidade ?? 1),
              preco_unitario: Number(ip.preco_unitario ?? ip.preco ?? 0),
            }))
          } else {
            listaItens = [
              {
                nome: p.descricao || 'Lanche Variado',
                quantidade: 1,
                preco_unitario: Number(p.valor_total ?? p.total ?? p.valor ?? 0),
              },
            ]
          }

          return {
            id: String(p.id),
            data: p.created_at
              ? new Date(p.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Hoje',
            itens: listaItens,
            valor_total: Number(p.valor_total ?? p.total ?? p.valor ?? 0),
          }
        })
        setUltimasCompras(formatados)
      } else {
        setUltimasCompras([
          {
            id: '1',
            data: 'Hoje, 10:15',
            valor_total: 12.5,
            itens: [
              { nome: 'Salgado Assado', quantidade: 1, preco_unitario: 7.5 },
              { nome: 'Suco Natural 300ml', quantidade: 1, preco_unitario: 5.0 },
            ],
          },
        ])
      }
    } catch (e) {
      console.log('Erro ao consultar compras do dependente:', e)
    }
  }

  useEffect(() => {
    fetchDados()
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchDados()
  }, [])

  const handleSelecionarAluno = (aluno: Dependente) => {
    setAlunoSelecionado(aluno)
    setNovoLimite(aluno.limite_diario ? String(aluno.limite_diario) : '')
    fetchComprasDetalhadas(aluno.id)
  }

  const handleAbrirModalLimite = () => {
    if (!alunoSelecionado) return
    setNovoLimite(String(alunoSelecionado.limite_diario))
    setModalLimiteVisible(true)
  }

  const handleSalvarLimiteModal = async () => {
    if (!alunoSelecionado) return

    setSalvandoLimite(true)
    try {
      const valNum = novoLimite ? parseFloat(novoLimite.replace(',', '.')) : null

      const { error: carteiraError } = await supabase
        .from('carteiras')
        .update({ limite_diario: valNum })
        .eq('aluno_id', alunoSelecionado.id)

      if (carteiraError) {
        await supabase
          .from('alunos')
          .update({ limite_diario: valNum })
          .eq('id', alunoSelecionado.id)
      }

      const msg = 'Limite diário alterado com sucesso!'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Sucesso', msg)

      setModalLimiteVisible(false)
      fetchDados()
    } catch (err: any) {
      const msg = err.message || 'Erro ao atualizar o limite.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Erro', msg)
    } finally {
      setSalvandoLimite(false)
    }
  }

  const handleAbrirModalEditar = () => {
    if (!alunoSelecionado) return
    setEditNome(alunoSelecionado.nome)
    setEditTurma(alunoSelecionado.turma || '')
    setEditSerie(alunoSelecionado.serie || '')
    setEditTurno(alunoSelecionado.turno || '')
    setModalEditarVisible(true)
  }

  const handleSalvarCadastro = async () => {
    if (!alunoSelecionado) return

    setSalvandoCadastro(true)
    try {
      const { error } = await supabase
        .from('alunos')
        .update({
          nome: editNome.trim(),
          turma: editTurma.trim(),
          serie: editSerie.trim(),
          turno: editTurno.trim(),
        })
        .eq('id', alunoSelecionado.id)

      if (error) throw error

      const msg = 'Dados do aluno atualizados com sucesso!'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Sucesso', msg)

      setModalEditarVisible(false)
      fetchDados()
    } catch (err: any) {
      const msg = err.message || 'Erro ao atualizar o cadastro.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Erro', msg)
    } finally {
      setSalvandoCadastro(false)
    }
  }

  const toggleRestricao = (id: string) => {
    setRestricoes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r))
    )
  }

  const handleSalvarRestricoes = () => {
    const msg = 'Restrições alimentares salvas! O caixa da cantina será notificado ao ler o cartão do aluno.'
    if (Platform.OS === 'web') alert(msg)
    else Alert.alert('Restrições Ativas', msg)
    setModalRestricoesVisible(false)
  }

  const gastoHoje = alunoSelecionado?.gasto_hoje || 0
  const limiteDiario = alunoSelecionado?.limite_diario || 1
  const porcentagemUso = Math.min(Math.round((gastoHoje / limiteDiario) * 100), 100)

  const getStatusColor = () => {
    if (porcentagemUso >= 90) return '#E11D48'
    if (porcentagemUso >= 70) return '#EA580C'
    return '#16A34A'
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2B6CB0']} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Meus Dependentes</Text>
        <Text style={styles.subtitle}>Gestão de saldo, limites e consumo escolar</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2B6CB0" style={{ marginVertical: 40 }} />
      ) : dependentes.length > 0 ? (
        <>
          <View style={styles.selectorRow}>
            {dependentes.map((dep) => {
              const isSelected = alunoSelecionado?.id === dep.id
              return (
                <View
                  key={dep.id}
                  style={[styles.depTabCard, isSelected && styles.depTabCardSelected]}
                >
                  <TouchableOpacity
                    style={styles.depTabContent}
                    onPress={() => handleSelecionarAluno(dep)}
                    activeOpacity={0.88}
                  >
                    {dep.avatar_url ? (
                      <Image source={{ uri: dep.avatar_url }} style={styles.tabAvatarImage} />
                    ) : (
                      <View style={[styles.tabAvatarBadge, isSelected && styles.tabAvatarBadgeSelected]}>
                        <Text style={[styles.tabAvatarText, isSelected && styles.tabAvatarTextSelected]}>
                          {dep.nome.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tabName, isSelected && styles.tabNameSelected]} numberOfLines={1}>
                        {dep.nome.split(' ')[0]}
                      </Text>
                      <Text style={[styles.tabSaldo, isSelected && styles.tabSaldoSelected]}>
                        R$ {dep.saldo.toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickLimitBadgeBtn, isSelected && styles.quickLimitBadgeBtnSelected]}
                    onPress={handleAbrirModalLimite}
                  >
                    <Ionicons
                      name="options-outline"
                      size={16}
                      color={isSelected ? '#FFFFFF' : '#2563EB'}
                    />
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>

          {alunoSelecionado && (
            <View style={styles.mainProfileCard}>
              <View style={styles.profileHeaderRow}>
                <View style={styles.profileLeftInfo}>
                  {alunoSelecionado.avatar_url ? (
                    <Image source={{ uri: alunoSelecionado.avatar_url }} style={styles.bigAvatarImage} />
                  ) : (
                    <View style={styles.bigAvatarBadge}>
                      <Text style={styles.bigAvatarInitial}>
                        {alunoSelecionado.nome.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{alunoSelecionado.nome}</Text>
                    <View style={styles.tagsRow}>
                      <Text style={styles.tagText}>{alunoSelecionado.turma}</Text>
                      <Text style={styles.tagDot}>•</Text>
                      <Text style={styles.tagText}>{alunoSelecionado.serie}</Text>
                      <Text style={styles.tagDot}>•</Text>
                      <Text style={styles.tagHighlight}>{alunoSelecionado.turno}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.statusBadgeActive}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusTextActive}>{alunoSelecionado.status}</Text>
                </View>
              </View>

              <View style={styles.saldoCardCompact}>
                <View>
                  <Text style={styles.saldoCompactLabel}>SALDO DISPONÍVEL</Text>
                  <Text style={styles.saldoCompactValue}>
                    R$ {alunoSelecionado.saldo.toFixed(2).replace('.', ',')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.rechargeBtnCompact}
                  onPress={() => router.push('/(tabs)/recarregar' as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="flash" size={14} color="#FFFFFF" />
                  <Text style={styles.rechargeBtnText}>RECARREGAR</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleAbrirModalEditar}>
                  <Ionicons name="create-outline" size={15} color="#2563EB" />
                  <Text style={styles.actionBtnText}>Dados</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push('/(tabs)/cartoes' as any)}
                >
                  <Ionicons name="card-outline" size={15} color="#9333EA" />
                  <Text style={styles.actionBtnText}>Cartão</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: '#FDBA74', backgroundColor: '#FFF7ED' }]}
                  onPress={() => setModalRestricoesVisible(true)}
                >
                  <Ionicons name="nutrition-outline" size={15} color="#EA580C" />
                  <Text style={[styles.actionBtnText, { color: '#C2410C' }]}>Restrições</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              <View style={styles.limitMetricIntegratedBox}>
                <View style={styles.limitHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="speedometer-outline" size={18} color="#2563EB" />
                    <Text style={styles.limitMetricTitle}>Consumo & Limite Diário</Text>
                  </View>

                  <TouchableOpacity onPress={handleAbrirModalLimite}>
                    <Text style={styles.editLimitLink}>
                      Limite: R$ {limiteDiario.toFixed(2)} ✏️
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${porcentagemUso}%`, backgroundColor: getStatusColor() },
                    ]}
                  />
                </View>

                <View style={styles.progressFooterRow}>
                  <Text style={styles.progressFooterText}>
                    Gasto Hoje: <Text style={{ fontWeight: '800', color: '#0F172A' }}>R$ {gastoHoje.toFixed(2)}</Text>
                  </Text>
                  <Text style={[styles.progressFooterPercent, { color: getStatusColor() }]}>
                    {porcentagemUso}% utilizado
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionHeaderTitle}>Últimas Compras do Dependente</Text>

              {ultimasCompras.length > 0 ? (
                ultimasCompras.map((compra) => (
                  <View key={compra.id} style={styles.receiptCard}>
                    <View style={styles.receiptHeader}>
                      <View style={styles.receiptDateGroup}>
                        <Ionicons name="receipt-outline" size={16} color="#EA580C" />
                        <Text style={styles.receiptDateText}>{compra.data}</Text>
                      </View>
                      <Text style={styles.receiptTotalText}>
                        - R$ {compra.valor_total.toFixed(2).replace('.', ',')}
                      </Text>
                    </View>

                    <View style={styles.receiptItemsList}>
                      {compra.itens.map((item, idx) => (
                        <View key={idx} style={styles.receiptItemRow}>
                          <Text style={styles.receiptItemName}>
                            <Text style={styles.receiptItemQty}>{item.quantidade}x </Text>
                            {item.nome}
                          </Text>
                          <Text style={styles.receiptItemPrice}>
                            R$ {(item.preco_unitario * item.quantidade).toFixed(2).replace('.', ',')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyComprasText}>Nenhuma compra registrada recentemente.</Text>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-circle-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Nenhum dependente encontrado</Text>
          <Text style={styles.emptySub}>Não há alunos vinculados à sua conta no momento.</Text>
        </View>
      )}

      {/* Modal Ajustar Limite */}
      <Modal visible={modalLimiteVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajustar Limite Diário</Text>
              <TouchableOpacity onPress={() => setModalLimiteVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Defina o valor máximo que <Text style={{ fontWeight: '800' }}>{alunoSelecionado?.nome}</Text> pode gastar por dia na cantina.
            </Text>

            <Text style={styles.modalLabel}>VALOR MÁXIMO DIÁRIO (R$)</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>R$</Text>
              <TextInput
                style={styles.input}
                placeholder="0,00"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={novoLimite}
                onChangeText={setNovoLimite}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, salvandoLimite && styles.saveBtnDisabled]}
              onPress={handleSalvarLimiteModal}
              disabled={salvandoLimite}
            >
              {salvandoLimite ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>CONFIRMAR NOVO LIMITE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Editar Dados */}
      <Modal visible={modalEditarVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Dados do Aluno</Text>
              <TouchableOpacity onPress={() => setModalEditarVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>NOME COMPLETO</Text>
            <TextInput
              style={styles.modalInput}
              value={editNome}
              onChangeText={setEditNome}
              placeholder="Nome do aluno"
            />

            <Text style={styles.modalLabel}>TURMA</Text>
            <TextInput
              style={styles.modalInput}
              value={editTurma}
              onChangeText={setEditTurma}
              placeholder="Ex: 6º Ano A"
            />

            <Text style={styles.modalLabel}>SÉRIE / ETAPA</Text>
            <TextInput
              style={styles.modalInput}
              value={editSerie}
              onChangeText={setEditSerie}
              placeholder="Ex: Ensino Fundamental"
            />

            <Text style={styles.modalLabel}>TURNO</Text>
            <TextInput
              style={styles.modalInput}
              value={editTurno}
              onChangeText={setEditTurno}
              placeholder="Ex: Manhã ou Tarde"
            />

            <TouchableOpacity
              style={[styles.saveBtn, salvandoCadastro && styles.saveBtnDisabled]}
              onPress={handleSalvarCadastro}
              disabled={salvandoCadastro}
            >
              {salvandoCadastro ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>SALVAR ALTERAÇÕES</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Restrições */}
      <Modal visible={modalRestricoesVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Restrições Alimentares</Text>
              <TouchableOpacity onPress={() => setModalRestricoesVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Selecione o que <Text style={{ fontWeight: '800' }}>{alunoSelecionado?.nome}</Text> NÃO pode consumir na cantina escolar:
            </Text>

            {restricoes.map((item) => (
              <View key={item.id} style={styles.restricaoRow}>
                <View style={styles.restricaoLeft}>
                  <Ionicons name={item.icone as any} size={20} color="#EA580C" />
                  <Text style={styles.restricaoNome}>{item.nome}</Text>
                </View>
                <Switch
                  value={item.ativo}
                  onValueChange={() => toggleRestricao(item.id)}
                  trackColor={{ false: '#CBD5E1', true: '#FFEDD5' }}
                  thumbColor={item.ativo ? '#EA580C' : '#F8FAFC'}
                />
              </View>
            ))}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSalvarRestricoes}>
              <Text style={styles.saveBtnText}>SALVAR RESTRIÇÕES</Text>
            </TouchableOpacity>
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
    marginBottom: 18,
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
  selectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  depTabCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  depTabCardSelected: {
    backgroundColor: '#2B6CB0',
    borderColor: '#2B6CB0',
  },
  depTabContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tabAvatarBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabAvatarBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2B6CB0',
  },
  tabAvatarTextSelected: {
    color: '#FFFFFF',
  },
  tabName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  tabNameSelected: {
    color: '#FFFFFF',
  },
  tabSaldo: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '700',
  },
  tabSaldoSelected: {
    color: '#BFDBFE',
  },
  quickLimitBadgeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    marginLeft: 4,
  },
  quickLimitBadgeBtnSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  mainProfileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 40,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  profileLeftInfo: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    flex: 1,
  },
  bigAvatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  bigAvatarBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigAvatarInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2B6CB0',
  },
  profileName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    marginTop: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#64748B',
  },
  tagHighlight: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  tagDot: {
    fontSize: 11,
    color: '#94A3B8',
  },
  statusBadgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  statusTextActive: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  saldoCardCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2B6CB0',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  saldoCompactLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#BFDBFE',
    letterSpacing: 0.8,
  },
  saldoCompactValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  rechargeBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F27835',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  rechargeBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 16,
  },
  limitMetricIntegratedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  limitHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  limitMetricTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  editLimitLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressFooterText: {
    fontSize: 11,
    color: '#64748B',
  },
  progressFooterPercent: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  receiptCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 6,
    marginBottom: 6,
  },
  receiptDateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  receiptDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  receiptTotalText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E11D48',
  },
  receiptItemsList: {
    gap: 3,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptItemName: {
    fontSize: 11,
    color: '#334155',
  },
  receiptItemQty: {
    fontWeight: '800',
    color: '#2563EB',
  },
  receiptItemPrice: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyComprasText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
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
  restricaoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  restricaoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  restricaoNome: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  modalInput: {
    height: 46,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 16,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  saveBtn: {
    height: 48,
    backgroundColor: '#1E62D0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
})