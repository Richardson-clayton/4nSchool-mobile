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
  Alert,
  Modal,
  Image,
  StatusBar,
  TextInput,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface CartaoAluno {
  id: string
  carteira_id?: string
  aluno_id: string
  aluno_nome: string
  matricula: string
  turma: string
  codigo_rfid: string
  codigo_passe: string
  tem_pin: boolean
  tem_facial: boolean
  foto_url?: string | null
  status: 'Ativo' | 'Bloqueado' | 'Pendente'
  bloqueado: boolean
  saldo: number
}

export default function CartoesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [cartoes, setCartoes] = useState<CartaoAluno[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null)

  // Modal Passe QR Code
  const [qrModalAluno, setQrModalAluno] = useState<CartaoAluno | null>(null)

  // Modal Senha / PIN do Totem
  const [pinModalAluno, setPinModalAluno] = useState<CartaoAluno | null>(null)
  const [novoPin, setNovoPin] = useState('')
  const [confirmarPin, setConfirmarPin] = useState('')
  const [mostrarPin, setMostrarPin] = useState(false)
  const [salvandoPin, setSalvandoPin] = useState(false)

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  const atualizarColunaResiliente = useCallback(
    async (alunoId: string, candidatos: Record<string, unknown>[]) => {
      for (const payload of candidatos) {
        const { error } = await supabase
          .from('alunos')
          .update(payload)
          .eq('id', alunoId)
        if (!error) return true
      }
      return false
    },
    []
  )

  const fetchCartoes = useCallback(async () => {
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

        const listaMapeada: CartaoAluno[] = alunosLista.map((aluno) => {
          const carteira = carteirasData?.find(
            (c: any) => String(c.aluno_id) === String(aluno.id)
          )

          const rfid =
            carteira?.codigo_rfid ||
            carteira?.rfid ||
            carteira?.nfc_id ||
            aluno?.codigo_rfid ||
            'Passe Digital / Totem'

          const isBloqueado = Boolean(
            carteira?.bloqueado ||
              carteira?.status === 'bloqueado' ||
              aluno?.cartao_bloqueado === true ||
              aluno?.bloqueado === true
          )

          const saldoReal = Number(
            carteira?.saldo ??
              carteira?.saldo_dinheiro ??
              carteira?.saldo_atual ??
              aluno?.saldo ??
              aluno?.saldo_atual ??
              0
          )

          const pinSalvo =
            aluno?.pin_consumo ||
            aluno?.senha_consumo ||
            aluno?.senha_totem ||
            aluno?.pin_totem ||
            aluno?.pin ||
            carteira?.pin ||
            ''

          const temPin = Boolean(String(pinSalvo).trim().length >= 4)
          const foto = aluno?.foto_facial_url || aluno?.foto_url || aluno?.avatar_url || null
          const temFacial =
            typeof aluno?.facial_ativa === 'boolean'
              ? aluno.facial_ativa
              : typeof aluno?.biometria_ativa === 'boolean'
              ? aluno.biometria_ativa
              : Boolean(foto)

          const matriculaLimpa = String(
            aluno.matricula || String(aluno.id).slice(0, 8).toUpperCase()
          )

          let statusLabel: 'Ativo' | 'Bloqueado' | 'Pendente' = 'Ativo'
          if (isBloqueado) {
            statusLabel = 'Bloqueado'
          } else if (!carteira && rfid === 'Passe Digital / Totem' && !temPin && !temFacial) {
            statusLabel = 'Pendente'
          }

          return {
            id: carteira?.id || aluno.id,
            carteira_id: carteira?.id,
            aluno_id: aluno.id,
            aluno_nome: aluno.nome || 'Aluno',
            matricula: matriculaLimpa,
            turma: aluno.turma || 'Sem turma',
            codigo_rfid: String(rfid),
            codigo_passe: `4NP:${matriculaLimpa}:${String(aluno.id).slice(0, 8).toUpperCase()}`,
            tem_pin: temPin,
            tem_facial: temFacial,
            foto_url: foto,
            status: statusLabel,
            bloqueado: isBloqueado,
            saldo: saldoReal,
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
  }, [])

  useEffect(() => {
    fetchCartoes()
  }, [fetchCartoes])

  const onRefresh = () => {
    setRefreshing(true)
    fetchCartoes()
  }

  const toggleBloqueioCartao = async (item: CartaoAluno) => {
    const novoEstado = !item.bloqueado
    setAtualizandoId(item.id)

    try {
      await atualizarColunaResiliente(item.aluno_id, [
        { cartao_bloqueado: novoEstado },
        { bloqueado: novoEstado },
      ])

      if (item.carteira_id) {
        await supabase
          .from('carteiras')
          .update({ bloqueado: novoEstado })
          .eq('id', item.carteira_id)
      }

      await supabase
        .from('rfid_tags')
        .update({ status: novoEstado ? 'bloqueado' : 'ativo' })
        .eq('aluno_id', item.aluno_id)

      setCartoes((prev) =>
        prev.map((c) =>
          c.id === item.id
            ? {
                ...c,
                bloqueado: novoEstado,
                status: novoEstado ? 'Bloqueado' : 'Ativo',
              }
            : c
        )
      )
    } catch (err: any) {
      mostrarAviso('Erro', err?.message || 'Não foi possível alterar o status do cartão.')
    } finally {
      setAtualizandoId(null)
    }
  }

  const handleAlternarFacial = async (item: CartaoAluno) => {
    const novoStatusFacial = !item.tem_facial
    if (novoStatusFacial && !item.foto_url) {
      mostrarAviso(
        'Foto Necessária',
        `Cadastre a foto facial de ${item.aluno_nome.split(' ')[0]} na aba Alunos ou pelo Portal Web para ativar o reconhecimento facial.`
      )
      return
    }

    setAtualizandoId(item.id)
    try {
      await atualizarColunaResiliente(item.aluno_id, [
        { facial_ativa: novoStatusFacial },
        { biometria_ativa: novoStatusFacial },
      ])

      setCartoes((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, tem_facial: novoStatusFacial } : c))
      )
      mostrarAviso(
        'Sucesso',
        `Reconhecimento facial de ${item.aluno_nome.split(' ')[0]} ${
          novoStatusFacial ? 'ativado' : 'pausado'
        }.`
      )
    } finally {
      setAtualizandoId(null)
    }
  }

  const handleSalvarPin = async () => {
    if (!pinModalAluno) return
    const pinLimpo = novoPin.replace(/\D/g, '')
    const confLimpo = confirmarPin.replace(/\D/g, '')

    if (pinLimpo.length < 4 || pinLimpo.length > 6) {
      mostrarAviso('Senha Inválida', 'A senha de consumo deve conter entre 4 e 6 números.')
      return
    }

    if (pinLimpo !== confLimpo) {
      mostrarAviso('Erro', 'A confirmação da senha não confere.')
      return
    }

    setSalvandoPin(true)
    try {
      const salvou = await atualizarColunaResiliente(pinModalAluno.aluno_id, [
        { pin_consumo: pinLimpo },
        { senha_consumo: pinLimpo },
        { senha_totem: pinLimpo },
        { pin: pinLimpo },
      ])

      if (!salvou) {
        throw new Error('Não foi possível salvar a senha no cadastro do aluno.')
      }

      setCartoes((prev) =>
        prev.map((c) => (c.id === pinModalAluno.id ? { ...c, tem_pin: true } : c))
      )
      setPinModalAluno(null)
      setNovoPin('')
      setConfirmarPin('')
      mostrarAviso(
        'Senha Atualizada',
        `Senha numérica de ${pinModalAluno.aluno_nome.split(' ')[0]} salva para uso no Totem.`
      )
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Erro ao gravar senha.')
    } finally {
      setSalvandoPin(false)
    }
  }

  const getBadgeStyle = (status: CartaoAluno['status']) => {
    if (status === 'Ativo') return { bg: '#22C55E', text: '#FFFFFF' }
    if (status === 'Bloqueado') return { bg: '#EF4444', text: '#FFFFFF' }
    return { bg: '#F27835', text: '#FFFFFF' }
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View
        style={[
          styles.topHeader,
          { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 20 : 40) + 8 },
        ]}
      >
        <View style={styles.headerNav}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/' as any)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTag}>IDENTIFICAÇÃO DIGITAL</Text>
            <Text style={styles.headerTitle}>Cartões, Facial & PIN</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
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
        ) : cartoes.length > 0 ? (
          cartoes.map((item) => {
            const badge = getBadgeStyle(item.status)
            return (
              <View
                key={item.id}
                style={[
                  styles.cardContainer,
                  item.bloqueado && styles.cardContainerBlocked,
                ]}
              >
                <View style={styles.cardAccentCircle} />

                <View style={styles.cardTopRow}>
                  <View style={styles.chipRow}>
                    <View style={styles.chipIcon}>
                      <Ionicons name="hardware-chip-outline" size={22} color="#FFFFFF" />
                    </View>
                    <Text style={styles.brandMini}>MENU COFFEE BREAK</Text>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusText, { color: badge.text }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardMiddleRow}>
                  <Text style={styles.alunoName}>{item.aluno_nome}</Text>
                  <Text style={styles.turmaText}>
                    {item.turma} • Matrícula: {item.matricula}
                  </Text>
                </View>

                {/* Botões de Configuração Facial e Senha PIN */}
                <View style={styles.credentialsRow}>
                  <TouchableOpacity
                    style={styles.credentialPill}
                    onPress={() => {
                      setPinModalAluno(item)
                      setNovoPin('')
                      setConfirmarPin('')
                    }}
                  >
                    <Ionicons
                      name={item.tem_pin ? 'keypad' : 'keypad-outline'}
                      size={13}
                      color={item.tem_pin ? '#4ADE80' : '#FDE68A'}
                    />
                    <Text style={styles.credentialPillText}>
                      {item.tem_pin ? 'Alterar PIN' : 'Criar PIN'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.credentialPill}
                    onPress={() => handleAlternarFacial(item)}
                  >
                    <Ionicons
                      name={item.tem_facial ? 'scan' : 'scan-outline'}
                      size={13}
                      color={item.tem_facial ? '#4ADE80' : '#FDE68A'}
                    />
                    <Text style={styles.credentialPillText}>
                      {item.tem_facial ? 'Facial Ativa' : 'Ativar Facial'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.cardFooter}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.labelRfid}>IDENTIFICAÇÃO / RFID</Text>
                    <Text style={styles.rfidCode} numberOfLines={1}>
                      {item.codigo_rfid}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.labelRfid}>SALDO DISPONÍVEL</Text>
                    <Text style={styles.saldoValue}>
                      R$ {item.saldo.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    style={styles.qrBtn}
                    onPress={() => setQrModalAluno(item)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="qr-code-outline" size={16} color="#1E2B58" />
                    <Text style={styles.qrBtnText}>Passe QR</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.lockBtn, item.bloqueado && styles.unlockBtn]}
                    onPress={() => toggleBloqueioCartao(item)}
                    disabled={atualizandoId === item.id}
                    activeOpacity={0.85}
                  >
                    {atualizandoId === item.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons
                          name={item.bloqueado ? 'lock-open-outline' : 'lock-closed-outline'}
                          size={16}
                          color="#FFFFFF"
                        />
                        <Text style={styles.lockBtnText}>
                          {item.bloqueado ? 'Desbloquear' : 'Bloquear'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )
          })
        ) : (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="card-outline" size={38} color="#1E62D0" />
            </View>
            <Text style={styles.emptyTitle}>Nenhum Cartão Cadastrado</Text>
            <Text style={styles.emptySub}>
              Vincule os seus alunos na aba Alunos para visualizar os cartões virtuais, RFID e Passe QR.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal Senha / PIN */}
      <Modal
        visible={Boolean(pinModalAluno)}
        transparent
        animationType="fade"
        onRequestClose={() => setPinModalAluno(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>SENHA NUMÉRICA (PIN)</Text>
            </View>

            <Text style={styles.modalAlunoName}>{pinModalAluno?.aluno_nome}</Text>
            <Text style={styles.modalAlunoSub}>
              Matrícula: {pinModalAluno?.matricula}
            </Text>

            <View style={{ width: '100%', gap: 10, marginBottom: 16 }}>
              <View style={styles.pinInputRow}>
                <TextInput
                  style={styles.pinInput}
                  placeholder="Nova senha (4 a 6 números)"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  maxLength={6}
                  secureTextEntry={!mostrarPin}
                  value={novoPin}
                  onChangeText={(t) => setNovoPin(t.replace(/\D/g, ''))}
                />
                <TouchableOpacity onPress={() => setMostrarPin(!mostrarPin)}>
                  <Ionicons
                    name={mostrarPin ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.pinInput, styles.pinInputSingle]}
                placeholder="Confirmar nova senha"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={6}
                secureTextEntry={!mostrarPin}
                value={confirmarPin}
                onChangeText={(t) => setConfirmarPin(t.replace(/\D/g, ''))}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { flex: 1, backgroundColor: '#F1F5F9' }]}
                onPress={() => setPinModalAluno(null)}
              >
                <Text style={[styles.modalCloseBtnText, { color: '#475569' }]}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { flex: 1 }]}
                onPress={handleSalvarPin}
                disabled={salvandoPin}
              >
                {salvandoPin ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalCloseBtnText}>SALVAR PIN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal do Passe Digital QR Code */}
      <Modal
        visible={Boolean(qrModalAluno)}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalAluno(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>PASSE DIGITAL DO TOTEM</Text>
            </View>

            <Text style={styles.modalAlunoName}>{qrModalAluno?.aluno_nome}</Text>
            <Text style={styles.modalAlunoSub}>
              {qrModalAluno?.turma} • Mat. {qrModalAluno?.matricula}
            </Text>

            {qrModalAluno && (
              <View style={styles.qrBox}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      qrModalAluno.codigo_passe
                    )}`,
                  }}
                  style={styles.qrImage}
                />
              </View>
            )}

            <Text style={styles.modalHint}>
              Apresente este QR Code no leitor do Totem da cantina para identificar o aluno.
            </Text>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setQrModalAluno(null)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>FECHAR PASSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1E2B58' },
  topHeader: { backgroundColor: '#1E2B58', paddingHorizontal: 20, paddingBottom: 22 },
  headerNav: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleBox: { flex: 1 },
  headerTag: { color: '#F27835', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  scrollContent: { padding: 20, paddingBottom: 40 },
  cardContainer: {
    backgroundColor: '#1E2B58',
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
    elevation: 5,
  },
  cardContainerBlocked: { backgroundColor: '#334155' },
  cardAccentCircle: {
    position: 'absolute',
    right: -45,
    top: -45,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#2853A4',
    opacity: 0.5,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chipIcon: {
    width: 38,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandMini: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  cardMiddleRow: { marginBottom: 14 },
  alunoName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  turmaText: { color: '#CBD5E1', fontSize: 12, marginTop: 2 },
  credentialsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  credentialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  credentialPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 12,
    gap: 12,
  },
  labelRfid: { color: '#93C5FD', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  rfidCode: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 2 },
  saldoValue: { color: '#4ADE80', fontSize: 16, fontWeight: '900', marginTop: 2 },
  cardActionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  qrBtn: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  qrBtnText: { color: '#1E2B58', fontSize: 12, fontWeight: '800' },
  lockBtn: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  unlockBtn: { backgroundColor: '#1E62D0' },
  lockBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
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
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 19 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  modalBadge: {
    backgroundColor: '#F27835',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  modalBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  modalAlunoName: { fontSize: 18, fontWeight: '800', color: '#1E293B', textAlign: 'center' },
  modalAlunoSub: { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 18 },
  pinInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  pinInput: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  pinInputSingle: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  qrBox: {
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  qrImage: { width: 200, height: 200 },
  modalHint: { fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  modalCloseBtn: {
    width: '100%',
    height: 46,
    borderRadius: 999,
    backgroundColor: '#1E62D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
})