import React, { useEffect, useState, useCallback, useMemo } from 'react'
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
  Share,
  StatusBar,
  Linking,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface Dependente {
  id: string
  nome: string
  turma?: string
  saldo: number
  limite_diario: number
  avatar_url?: string | null
  escola_id?: string
  tipo: 'aluno' | 'responsavel'
}

interface RecargaHistorico {
  id: string
  valor: number
  status: string
  metodo: string
  created_at: string
}

type FormaPagamento = 'pix' | 'cartao' | 'boleto'
type GatewayPagamento = 'asaas' | 'stoner'

const PORTAL_BASE_URL = (
  process.env.EXPO_PUBLIC_PORTAL_URL || 'https://menucoffeebreak.com.br'
).replace(/\/$/, '')

const VALORES_PREDEFINIDOS = [10, 20, 30, 50, 100]

const formatarMoeda = (valor: number) =>
  `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`

function formatarImagemBase64(img: string | null): string | null {
  if (!img) return null
  if (img.startsWith('data:image') || img.startsWith('http')) return img
  return `data:image/png;base64,${img}`
}

function formatarNumeroCartao(val: string): string {
  return val
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim()
}

function formatarValidadeCartao(val: string): string {
  const limpo = val.replace(/\D/g, '').slice(0, 4)
  if (limpo.length <= 2) return limpo
  return `${limpo.slice(0, 2)}/${limpo.slice(2)}`
}

export default function RecarregarScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const isTablet = width >= 768

  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [valor, setValor] = useState<string>('30.00')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('pix')
  const [gatewayAtivo, setGatewayAtivo] = useState<GatewayPagamento>('asaas')

  // Dados do Cartão de Crédito
  const [cartaoNumero, setCartaoNumero] = useState('')
  const [cartaoNome, setCartaoNome] = useState('')
  const [cartaoValidade, setCartaoValidade] = useState('')
  const [cartaoCvv, setCartaoCvv] = useState('')

  // Estados de Fluxo e Retorno do Gateway
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [gerandoPagamento, setGerandoPagamento] = useState(false)
  const [pagamentoGerado, setPagamentoGerado] = useState(false)
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState(false)
  const [verificandoPagamento, setVerificandoPagamento] = useState(false)
  const [saldoAntesRecarga, setSaldoAntesRecarga] = useState<number>(0)

  // Dados específicos PIX / Boleto (Asaas ou Stoner)
  const [pixPaymentId, setPixPaymentId] = useState<string | null>(null)
  const [pixQrCodeImage, setPixQrCodeImage] = useState<string | null>(null)
  const [chaveCopiaCola, setChaveCopiaCola] = useState<string>('')
  const [boletoLinhaDigitavel, setBoletoLinhaDigitavel] = useState<string>('')
  const [boletoUrl, setBoletoUrl] = useState<string>('')
  const [copiado, setCopiado] = useState(false)

  // Histórico recente de recargas
  const [historicoRecargas, setHistoricoRecargas] = useState<RecargaHistorico[]>([])

  // Modal de Ajuste de Limite Diário
  const [modalLimite, setModalLimite] = useState(false)
  const [novoLimite, setNovoLimite] = useState<string>('20')
  const [salvandoLimite, setSalvandoLimite] = useState(false)

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  const valorNumerico = useMemo(() => {
    const parsed = parseFloat(valor.replace(',', '.'))
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
  }, [valor])

  const carregarHistorico = useCallback(async (alunoId: string) => {
    if (!alunoId) return
    try {
      const { data, error } = await supabase
        .from('recargas')
        .select('*')
        .eq('aluno_id', alunoId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (!error && data) {
        setHistoricoRecargas(
          data.map((r: any) => ({
            id: String(r.id),
            valor: Number(r.valor || 0),
            status: String(r.status || 'pendente'),
            metodo: String(r.forma_pagamento || r.metodo || r.tipo || 'PIX'),
            created_at: String(r.created_at || new Date().toISOString()),
          }))
        )
      } else {
        setHistoricoRecargas([])
      }
    } catch {
      setHistoricoRecargas([])
    }
  }, [])

  const fetchAlunos = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: perfil }, { data: usuario }] = await Promise.all([
        supabase.from('perfis').select('id').eq('id', user.id).maybeSingle(),
        supabase
          .from('usuarios')
          .select('id, escola_id')
          .or(`id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle(),
      ])

      const responsavelId = usuario?.id || perfil?.id || user.id
      const mapaAlunos = new Map<string, any>()

      const { data: diretos } = await supabase
        .from('alunos')
        .select('*')
        .eq('responsavel_id', responsavelId)
        .order('nome', { ascending: true })

      if (diretos) {
        diretos.forEach((a: any) => mapaAlunos.set(String(a.id), a))
      }

      const [vincPlural, vincSingular] = await Promise.allSettled([
        supabase.from('responsaveis_alunos').select('aluno_id').eq('responsavel_id', responsavelId),
        supabase.from('responsavel_aluno').select('aluno_id').eq('responsavel_id', responsavelId),
      ])

      const idsExtras: string[] = []
      if (vincPlural.status === 'fulfilled' && vincPlural.value.data) {
        vincPlural.value.data.forEach((v: any) => idsExtras.push(String(v.aluno_id)))
      }
      if (vincSingular.status === 'fulfilled' && vincSingular.value.data) {
        vincSingular.value.data.forEach((v: any) => idsExtras.push(String(v.aluno_id)))
      }

      const idsNaoCarregados = [...new Set(idsExtras)].filter((id) => !mapaAlunos.has(id))
      if (idsNaoCarregados.length > 0) {
        const { data: porIds } = await supabase
          .from('alunos')
          .select('*')
          .in('id', idsNaoCarregados)
          .order('nome', { ascending: true })

        if (porIds) {
          porIds.forEach((a: any) => mapaAlunos.set(String(a.id), a))
        }
      }

      const alunosLista = Array.from(mapaAlunos.values())

      // Detecta o gateway configurado na escola (Asaas ou Stoner)
      const escolaId = usuario?.escola_id || alunosLista[0]?.escola_id
      if (escolaId) {
        try {
          const { data: escolaData } = await supabase
            .from('escola')
            .select('*')
            .eq('id', escolaId)
            .maybeSingle()

          const gw = String(
            escolaData?.gateway_pagamento ||
              escolaData?.provedor_pix ||
              escolaData?.gateway ||
              'asaas'
          ).toLowerCase()
          if (gw.includes('stoner')) {
            setGatewayAtivo('stoner')
          } else {
            setGatewayAtivo('asaas')
          }
        } catch {
          // Mantém 'asaas' como padrão
        }
      }

      if (alunosLista.length === 0) {
        setDependentes([])
        setAlunoSelecionado(null)
        return
      }

      const alunoIds = alunosLista.map((a: any) => a.id)
      const carteirasMap: Record<string, { saldo: number; limite_diario?: number }> = {}

      try {
        const { data: carteirasData } = await supabase
          .from('carteiras')
          .select('*')
          .in('aluno_id', alunoIds)

        if (carteirasData) {
          carteirasData.forEach((c: any) => {
            const valSaldo = Number(c.saldo ?? c.saldo_dinheiro ?? c.saldo_atual ?? c.valor ?? 0)
            const valLimite =
              c.limite_diario !== undefined && c.limite_diario !== null
                ? Number(c.limite_diario)
                : c.limite !== undefined && c.limite !== null
                ? Number(c.limite)
                : undefined
            carteirasMap[String(c.aluno_id)] = { saldo: valSaldo, limite_diario: valLimite }
          })
        }
      } catch (e) {
        console.log('Tabela carteiras não consultada:', e)
      }

      const mapeados: Dependente[] = alunosLista.map((a: any) => {
        const aid = String(a.id)
        const infoCarteira = carteirasMap[aid]
        const saldoFinal =
          infoCarteira !== undefined ? infoCarteira.saldo : Number(a.saldo ?? a.saldo_atual ?? 0)
        const limiteFinal =
          infoCarteira?.limite_diario !== undefined
            ? infoCarteira.limite_diario
            : Number(a.limite_diario ?? a.limite ?? 0)
        const ehResponsavel = a.tipo === 'responsavel' || Boolean(a.is_self)

        return {
          id: aid,
          nome: a.nome || 'Aluno',
          turma: a.turma || '',
          saldo: saldoFinal,
          limite_diario: limiteFinal,
          avatar_url: a.foto_facial_url || a.foto_url || a.avatar_url || a.foto || null,
          escola_id: a.escola_id,
          tipo: ehResponsavel ? 'responsavel' : 'aluno',
        }
      })

      setDependentes(mapeados)
      setAlunoSelecionado((prev) => {
        const atual = prev
          ? mapeados.find((m) => m.id === prev.id) || mapeados[0]
          : mapeados[0]
        if (atual) {
          setNovoLimite(String(atual.limite_diario))
          carregarHistorico(atual.id)
        }
        return atual || null
      })
    } catch (err) {
      console.error('Erro ao buscar alunos para recarga:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [carregarHistorico])

  useEffect(() => {
    fetchAlunos()
  }, [fetchAlunos])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchAlunos()
  }, [fetchAlunos])

  // Verifica confirmação tanto via API do Gateway (/status) quanto pelo saldo atualizado no Supabase
  const verificarConfirmacaoSaldo = useCallback(async () => {
    if (!alunoSelecionado || pagamentoConfirmado) return
    setVerificandoPagamento(true)
    try {
      let confirmadoGateway = false

      if (pixPaymentId) {
        const resStatus = await fetch(
          `${PORTAL_BASE_URL}/api/pagamentos/${gatewayAtivo}/status?paymentId=${encodeURIComponent(
            pixPaymentId
          )}`
        )
        if (resStatus.ok) {
          const statusData = await resStatus.json()
          confirmadoGateway = Boolean(statusData?.pago)
        }
      }

      const [{ data: carteiraData }, { data: alunoData }] = await Promise.all([
        supabase
          .from('carteiras')
          .select('saldo')
          .eq('aluno_id', alunoSelecionado.id)
          .maybeSingle(),
        supabase
          .from('alunos')
          .select('saldo')
          .eq('id', alunoSelecionado.id)
          .maybeSingle(),
      ])

      const saldoCarteira = Number(carteiraData?.saldo ?? 0)
      const saldoAluno = Number(alunoData?.saldo ?? 0)
      const maiorSaldoAtual = Math.max(saldoCarteira, saldoAluno)

      if (confirmadoGateway || maiorSaldoAtual > saldoAntesRecarga) {
        const novoSaldoExibido =
          maiorSaldoAtual > saldoAntesRecarga
            ? maiorSaldoAtual
            : Number((saldoAntesRecarga + valorNumerico).toFixed(2))

        setPagamentoConfirmado(true)
        setDependentes((prev) =>
          prev.map((d) =>
            d.id === alunoSelecionado.id ? { ...d, saldo: novoSaldoExibido } : d
          )
        )
        setAlunoSelecionado((prev) =>
          prev ? { ...prev, saldo: novoSaldoExibido } : null
        )
        await carregarHistorico(alunoSelecionado.id)
      }
    } finally {
      setVerificandoPagamento(false)
    }
  }, [
    alunoSelecionado,
    pagamentoConfirmado,
    pixPaymentId,
    gatewayAtivo,
    saldoAntesRecarga,
    valorNumerico,
    carregarHistorico,
  ])

  // Realtime + Polling automático enquanto aguarda confirmação do PIX
  useEffect(() => {
    if (
      !pagamentoGerado ||
      pagamentoConfirmado ||
      formaPagamento !== 'pix' ||
      !alunoSelecionado?.id
    ) {
      return
    }

    const alunoId = alunoSelecionado.id

    const channel = supabase
      .channel(`saldo-recarga-mobile-${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'carteiras',
          filter: `aluno_id=eq.${alunoId}`,
        },
        (payload) => {
          const novoSaldo = Number((payload.new as { saldo?: number })?.saldo ?? 0)
          if (novoSaldo > saldoAntesRecarga) {
            setPagamentoConfirmado(true)
            setDependentes((prev) =>
              prev.map((d) => (d.id === alunoId ? { ...d, saldo: novoSaldo } : d))
            )
            setAlunoSelecionado((prev) => (prev ? { ...prev, saldo: novoSaldo } : null))
            carregarHistorico(alunoId)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alunos',
          filter: `id=eq.${alunoId}`,
        },
        (payload) => {
          const novoSaldo = Number((payload.new as { saldo?: number })?.saldo ?? 0)
          if (novoSaldo > saldoAntesRecarga) {
            setPagamentoConfirmado(true)
            setDependentes((prev) =>
              prev.map((d) => (d.id === alunoId ? { ...d, saldo: novoSaldo } : d))
            )
            setAlunoSelecionado((prev) => (prev ? { ...prev, saldo: novoSaldo } : null))
            carregarHistorico(alunoId)
          }
        }
      )
      .subscribe()

    const interval = setInterval(() => {
      verificarConfirmacaoSaldo()
    }, 4000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [
    pagamentoGerado,
    pagamentoConfirmado,
    formaPagamento,
    alunoSelecionado,
    saldoAntesRecarga,
    verificarConfirmacaoSaldo,
    carregarHistorico,
  ])

  const handleGerarPagamento = async () => {
    if (!alunoSelecionado) {
      mostrarAviso('Atenção', 'Selecione um dependente ou titular para receber a recarga.')
      return
    }

    if (valorNumerico < 5) {
      mostrarAviso('Valor Inválido', 'O valor mínimo para recarga é de R$ 5,00.')
      return
    }

    if (formaPagamento === 'cartao') {
      const numLimpo = cartaoNumero.replace(/\D/g, '')
      if (
        numLimpo.length < 13 ||
        !cartaoNome.trim() ||
        cartaoValidade.length < 5 ||
        cartaoCvv.length < 3
      ) {
        mostrarAviso('Dados Incompletos', 'Preencha corretamente todos os dados do cartão de crédito.')
        return
      }
    }

    setGerandoPagamento(true)
    setSaldoAntesRecarga(Number(alunoSelecionado.saldo || 0))

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      }

      if (formaPagamento === 'pix') {
        const response = await fetch(`${PORTAL_BASE_URL}/api/pagamentos/${gatewayAtivo}/pix`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            alunoId: alunoSelecionado.id,
            valor: valorNumerico,
            gateway: gatewayAtivo,
          }),
        })

        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          throw new Error(
            response.status === 404
              ? `Serviço PIX (${gatewayAtivo.toUpperCase()}) não encontrado no servidor.`
              : `Resposta inválida do servidor (HTTP ${response.status}).`
          )
        }

        const resData = await response.json()
        if (!response.ok || resData.error) {
          throw new Error(
            resData.error || `Falha ao gerar cobrança PIX no ${gatewayAtivo.toUpperCase()}.`
          )
        }

        const payloadPix = resData.payload || resData.emv || resData.qr_code_text || ''
        const imgBase64 =
          formatarImagemBase64(resData.encodedImage || resData.qr_code_base64 || null) ||
          (payloadPix
            ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                payloadPix
              )}`
            : null)

        setPixPaymentId(resData.paymentId || resData.txid || resData.id || null)
        setPixQrCodeImage(imgBase64)
        setChaveCopiaCola(payloadPix)
        setPagamentoConfirmado(false)
        setPagamentoGerado(true)
        await carregarHistorico(alunoSelecionado.id)
      } else if (formaPagamento === 'cartao') {
        const response = await fetch(
          `${PORTAL_BASE_URL}/api/pagamentos/${gatewayAtivo}/cartao`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              alunoId: alunoSelecionado.id,
              valor: valorNumerico,
              gateway: gatewayAtivo,
              cartao: {
                numero: cartaoNumero.replace(/\D/g, ''),
                nome: cartaoNome.trim(),
                validade: cartaoValidade,
                cvv: cartaoCvv.replace(/\D/g, ''),
              },
            }),
          }
        )

        if (response.status === 404) {
          throw new Error(
            'Pagamento via Cartão de Crédito ainda não está habilitado pela escola. Utilize o PIX Instantâneo.'
          )
        }

        const resData = await response.json()
        if (!response.ok || resData.error) {
          throw new Error(resData.error || 'Não foi possível processar o cartão de crédito.')
        }

        setPagamentoConfirmado(true)
        setPagamentoGerado(true)
        await fetchAlunos()
      } else if (formaPagamento === 'boleto') {
        const response = await fetch(
          `${PORTAL_BASE_URL}/api/pagamentos/${gatewayAtivo}/boleto`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              alunoId: alunoSelecionado.id,
              valor: valorNumerico,
              gateway: gatewayAtivo,
            }),
          }
        )

        if (response.status === 404) {
          throw new Error(
            'Emissão de Boleto Bancário ainda não está habilitada pela escola. Utilize o PIX Instantâneo.'
          )
        }

        const resData = await response.json()
        if (!response.ok || resData.error) {
          throw new Error(resData.error || 'Não foi possível gerar o boleto bancário.')
        }

        setBoletoLinhaDigitavel(resData.identificationField || resData.linhaDigitavel || '')
        setBoletoUrl(resData.bankSlipUrl || resData.invoiceUrl || '')
        setPagamentoConfirmado(false)
        setPagamentoGerado(true)
        await carregarHistorico(alunoSelecionado.id)
      }
    } catch (e: any) {
      mostrarAviso('Erro na Recarga', e.message || 'Não foi possível gerar a cobrança.')
    } finally {
      setGerandoPagamento(false)
    }
  }

  const handleCopiarTexto = async (texto: string) => {
    if (!texto) return
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(texto)
      } else {
        await Clipboard.setStringAsync(texto)
      }
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
      mostrarAviso('Copiado!', 'Código copiado para a área de transferência.')
    } catch {
      await Share.share({ message: texto })
    }
  }

  const handleResetarRecarga = () => {
    setPagamentoGerado(false)
    setPagamentoConfirmado(false)
    setPixPaymentId(null)
    setPixQrCodeImage(null)
    setChaveCopiaCola('')
    setBoletoLinhaDigitavel('')
    setBoletoUrl('')
  }

  const salvarLimiteDiario = async () => {
    if (!alunoSelecionado) return
    const limiteNum = parseFloat(novoLimite.replace(',', '.'))

    if (isNaN(limiteNum) || limiteNum < 0) {
      mostrarAviso('Erro', 'Informe um valor válido para o limite diário.')
      return
    }

    setSalvandoLimite(true)
    try {
      await Promise.all([
        supabase
          .from('carteiras')
          .update({ limite_diario: limiteNum })
          .eq('aluno_id', alunoSelecionado.id),
        supabase
          .from('alunos')
          .update({ limite_diario: limiteNum })
          .eq('id', alunoSelecionado.id),
      ])

      setDependentes((prev) =>
        prev.map((d) =>
          d.id === alunoSelecionado.id ? { ...d, limite_diario: limiteNum } : d
        )
      )
      setAlunoSelecionado({ ...alunoSelecionado, limite_diario: limiteNum })
      setModalLimite(false)
      mostrarAviso(
        'Sucesso',
        `Limite diário de ${alunoSelecionado.nome} atualizado para ${formatarMoeda(limiteNum)}.`
      )
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Não foi possível salvar o limite diário.')
    } finally {
      setSalvandoLimite(false)
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Cabeçalho Institucional */}
      <View
        style={[
          styles.topHeader,
          { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 20 : 40) + 6 },
        ]}
      >
        <View style={styles.topAccentCircle} />
        <View style={styles.headerTopRow}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>CRÉDITO DIGITAL</Text>
          </View>

          {/* Seletor de Gateway (Asaas / Stoner) */}
          <View style={styles.gatewaySwitchRow}>
            <TouchableOpacity
              style={[
                styles.gatewayPill,
                gatewayAtivo === 'asaas' && styles.gatewayPillActive,
              ]}
              onPress={() => {
                setGatewayAtivo('asaas')
                handleResetarRecarga()
              }}
            >
              <Text
                style={[
                  styles.gatewayPillText,
                  gatewayAtivo === 'asaas' && styles.gatewayPillTextActive,
                ]}
              >
                ASAAS
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.gatewayPill,
                gatewayAtivo === 'stoner' && styles.gatewayPillActive,
              ]}
              onPress={() => {
                setGatewayAtivo('stoner')
                handleResetarRecarga()
              }}
            >
              <Text
                style={[
                  styles.gatewayPillText,
                  gatewayAtivo === 'stoner' && styles.gatewayPillTextActive,
                ]}
              >
                STONER
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.title}>Recarregar Carteira</Text>
        <Text style={styles.subtitle}>
          Adicione saldo instantâneo via {gatewayAtivo.toUpperCase()} e configure o limite diário
        </Text>
      </View>

      {/* Corpo Branco Arredondado */}
      <ScrollView
        style={styles.bodySheet}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: Math.max(insets.bottom + 32, 48) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E62D0']} />
        }
      >
        <View style={[styles.mainWrapper, isTablet && styles.mainWrapperTablet]}>
          {loading ? (
            <ActivityIndicator size="large" color="#1E62D0" style={{ marginVertical: 48 }} />
          ) : pagamentoGerado ? (
            /* TELA DE COBRANÇA GERADA / CONFIRMAÇÃO (IDÊNTICA AO PORTAL WEB) */
            <View style={styles.pixBoxContainer}>
              {pagamentoConfirmado ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <View style={styles.confirmedIconCircle}>
                    <Ionicons name="checkmark-circle" size={44} color="#16A34A" />
                  </View>
                  <Text style={styles.confirmedBadge}>SALDO CREDITADO</Text>
                  <Text style={styles.pixBoxTitle}>Recarga Confirmada!</Text>
                  <Text style={styles.pixBoxSub}>
                    O valor de{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                      {formatarMoeda(valorNumerico)}
                    </Text>{' '}
                    já está disponível na carteira de{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                      {alunoSelecionado?.nome}
                    </Text>
                    .
                  </Text>
                </View>
              ) : formaPagamento === 'pix' ? (
                <>
                  <View style={styles.waitingPixBadge}>
                    <Ionicons name="time-outline" size={14} color="#B45309" />
                    <Text style={styles.waitingPixBadgeText}>
                      AGUARDANDO PAGAMENTO PIX ({gatewayAtivo.toUpperCase()})
                    </Text>
                  </View>

                  <Text style={styles.pixValorGrande}>{formatarMoeda(valorNumerico)}</Text>
                  <Text style={styles.pixBoxSub}>
                    Recarga destinada para:{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                      {alunoSelecionado?.nome}
                    </Text>
                  </Text>

                  <View style={styles.qrCodeWrapper}>
                    {pixQrCodeImage ? (
                      <Image
                        source={{ uri: pixQrCodeImage }}
                        style={styles.qrCodeImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons name="qr-code-outline" size={160} color="#0F172A" />
                    )}
                  </View>

                  <Text style={styles.pixHelperText}>
                    Abra o aplicativo do seu banco, escolha Pix QR Code e aponte a câmera. A
                    confirmação ocorre automaticamente em segundos.
                  </Text>

                  <TouchableOpacity
                    style={styles.copyColaButton}
                    onPress={() => handleCopiarTexto(chaveCopiaCola)}
                  >
                    <Ionicons
                      name={copiado ? 'checkmark' : 'copy-outline'}
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.copyColaButtonText}>
                      {copiado ? 'CÓDIGO COPIADO!' : 'COPIAR CHAVE PIX COPIA E COLA'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.monitoringBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <ActivityIndicator size="small" color="#1E62D0" />
                      <Text style={styles.monitoringText}>
                        Monitorando confirmação automática do banco...
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.verifyNowBtn}
                      onPress={verificarConfirmacaoSaldo}
                      disabled={verificandoPagamento}
                    >
                      <Text style={styles.verifyNowBtnText}>
                        {verificandoPagamento ? 'VERIFICANDO...' : 'JÁ PAGUEI'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                /* BOLETO BANCÁRIO GERADO */
                <View style={{ width: '100%', alignItems: 'center' }}>
                  <View style={styles.waitingPixBadge}>
                    <Ionicons name="barcode-outline" size={14} color="#B45309" />
                    <Text style={styles.waitingPixBadgeText}>BOLETO BANCÁRIO GERADO</Text>
                  </View>

                  <Text style={styles.pixValorGrande}>{formatarMoeda(valorNumerico)}</Text>
                  <Text style={styles.pixBoxSub}>
                    O saldo será creditado automaticamente após a compensação (1 a 2 dias úteis).
                  </Text>

                  {!!boletoLinhaDigitavel && (
                    <TouchableOpacity
                      style={styles.copyColaButton}
                      onPress={() => handleCopiarTexto(boletoLinhaDigitavel)}
                    >
                      <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.copyColaButtonText}>COPIAR LINHA DIGITÁVEL</Text>
                    </TouchableOpacity>
                  )}

                  {!!boletoUrl && (
                    <TouchableOpacity
                      style={[styles.copyColaButton, { backgroundColor: '#0F172A', marginTop: 10 }]}
                      onPress={() => Linking.openURL(boletoUrl)}
                    >
                      <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.copyColaButtonText}>ABRIR PDF DO BOLETO</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={styles.newRechargeLinkBtn}
                onPress={handleResetarRecarga}
              >
                <Ionicons name="refresh" size={15} color="#475569" />
                <Text style={styles.newRechargeLinkText}>REALIZAR OUTRA RECARGA</Text>
              </TouchableOpacity>
            </View>
          ) : dependentes.length > 0 ? (
            <>
              {/* 1. SELEÇÃO DE DEPENDENTE / TITULAR */}
              <Text style={styles.stepLabel}>1. SELECIONE O DEPENDENTE OU TITULAR</Text>
              <View style={styles.studentsGrid}>
                {dependentes.map((dep) => {
                  const isSelected = alunoSelecionado?.id === dep.id
                  const saldoBaixo = Number(dep.saldo || 0) < 10
                  return (
                    <TouchableOpacity
                      key={dep.id}
                      style={[styles.studentCard, isSelected && styles.studentCardSelected]}
                      onPress={() => {
                        setAlunoSelecionado(dep)
                        setNovoLimite(String(dep.limite_diario))
                        carregarHistorico(dep.id)
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.avatarWrapper}>
                        {dep.avatar_url ? (
                          <Image source={{ uri: dep.avatar_url }} style={styles.avatarImage} />
                        ) : (
                          <View
                            style={[styles.avatarBadge, isSelected && styles.avatarBadgeSelected]}
                          >
                            <Text
                              style={[
                                styles.avatarInitial,
                                isSelected && styles.avatarInitialSelected,
                              ]}
                            >
                              {dep.nome.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text
                        style={[styles.studentName, isSelected && styles.studentNameSelected]}
                        numberOfLines={1}
                      >
                        {dep.nome}
                      </Text>

                      <View style={[styles.saldoBadge, isSelected && styles.saldoBadgeSelected]}>
                        <Text
                          style={[
                            styles.saldoBadgeText,
                            isSelected && styles.saldoBadgeTextSelected,
                          ]}
                        >
                          Saldo: {formatarMoeda(dep.saldo)}
                        </Text>
                      </View>

                      {saldoBaixo && (
                        <Text
                          style={[
                            styles.saldoBaixoMiniTag,
                            isSelected && { color: '#FDE68A' },
                          ]}
                        >
                          SALDO BAIXO
                        </Text>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* PAINEL DE CONTROLE DE LIMITES */}
              {alunoSelecionado && (
                <View style={styles.controlBox}>
                  <View style={styles.controlHeader}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#1E62D0" />
                    <Text style={styles.controlTitle}>Controle de Consumo Diário</Text>
                  </View>

                  <View style={styles.controlRow}>
                    <View>
                      <Text style={styles.controlLabel}>Limite máximo por dia na cantina</Text>
                      <Text style={styles.controlValue}>
                        {formatarMoeda(alunoSelecionado.limite_diario)} / dia
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.controlBtn}
                      onPress={() => {
                        setNovoLimite(String(alunoSelecionado.limite_diario))
                        setModalLimite(true)
                      }}
                    >
                      <Text style={styles.controlBtnText}>Ajustar Limite</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* 2. SELEÇÃO DE VALORES */}
              <View style={styles.stepHeaderRow}>
                <Text style={styles.stepLabel}>2. ESCOLHA OU DIGITE O VALOR (R$)</Text>
                <Text style={styles.minValueHint}>Mínimo R$ 5,00</Text>
              </View>

              <View style={styles.quickValuesGrid}>
                {VALORES_PREDEFINIDOS.map((v) => {
                  const valStr = v.toFixed(2)
                  const isSelected = valor === valStr
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[styles.quickValueChip, isSelected && styles.quickValueChipSelected]}
                      onPress={() => setValor(valStr)}
                    >
                      <Text
                        style={[
                          styles.quickValueText,
                          isSelected && styles.quickValueTextSelected,
                        ]}
                      >
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
                  placeholder="0,00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={valor}
                  onChangeText={setValor}
                />
              </View>

              {/* PROJEÇÃO DE SALDO APÓS RECARGA */}
              {alunoSelecionado && valorNumerico > 0 && (
                <View style={styles.projectionBox}>
                  <Text style={styles.projectionLabel}>Projeção após confirmação:</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.projectionOld}>
                      {formatarMoeda(alunoSelecionado.saldo)}
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color="#64748B" />
                    <Text style={styles.projectionNew}>
                      {formatarMoeda(Number(alunoSelecionado.saldo || 0) + valorNumerico)}
                    </Text>
                  </View>
                </View>
              )}

              {/* 3. FORMA DE PAGAMENTO */}
              <Text style={styles.stepLabel}>3. FORMA DE PAGAMENTO</Text>
              <View style={styles.metodosWrapper}>
                <TouchableOpacity
                  style={[styles.metodoCard, formaPagamento === 'pix' && styles.metodoCardPixSel]}
                  onPress={() => setFormaPagamento('pix')}
                >
                  <Ionicons
                    name="flash"
                    size={22}
                    color={formaPagamento === 'pix' ? '#059669' : '#64748B'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.metodoTitle,
                        formaPagamento === 'pix' && { color: '#059669' },
                      ]}
                    >
                      PIX Instantâneo ({gatewayAtivo.toUpperCase()})
                    </Text>
                    <Text style={styles.metodoSub}>Liberação na hora via QR Code</Text>
                  </View>
                  {formaPagamento === 'pix' && (
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.metodoCard,
                    formaPagamento === 'cartao' && styles.metodoCardSelected,
                  ]}
                  onPress={() => setFormaPagamento('cartao')}
                >
                  <Ionicons
                    name="card-outline"
                    size={22}
                    color={formaPagamento === 'cartao' ? '#1E62D0' : '#64748B'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.metodoTitle,
                        formaPagamento === 'cartao' && styles.metodoTitleSelected,
                      ]}
                    >
                      Cartão de Crédito
                    </Text>
                    <Text style={styles.metodoSub}>Crédito à vista</Text>
                  </View>
                  {formaPagamento === 'cartao' && (
                    <Ionicons name="checkmark-circle" size={20} color="#1E62D0" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.metodoCard,
                    formaPagamento === 'boleto' && styles.metodoCardBoletoSel,
                  ]}
                  onPress={() => setFormaPagamento('boleto')}
                >
                  <Ionicons
                    name="barcode-outline"
                    size={22}
                    color={formaPagamento === 'boleto' ? '#D97706' : '#64748B'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.metodoTitle,
                        formaPagamento === 'boleto' && { color: '#B45309' },
                      ]}
                    >
                      Boleto Bancário
                    </Text>
                    <Text style={styles.metodoSub}>1 a 2 dias úteis</Text>
                  </View>
                  {formaPagamento === 'boleto' && (
                    <Ionicons name="checkmark-circle" size={20} color="#D97706" />
                  )}
                </TouchableOpacity>
              </View>

              {/* FORMULÁRIO DO CARTÃO DE CRÉDITO */}
              {formaPagamento === 'cartao' && (
                <View style={styles.cardFormBox}>
                  <Text style={styles.cardFormTitle}>DADOS DO CARTÃO DE CRÉDITO</Text>
                  <TextInput
                    style={styles.cardInput}
                    placeholder="Número do Cartão (0000 0000 0000 0000)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={cartaoNumero}
                    onChangeText={(t) => setCartaoNumero(formatarNumeroCartao(t))}
                  />
                  <TextInput
                    style={styles.cardInput}
                    placeholder="Nome Impresso no Cartão"
                    placeholderTextColor="#94A3B8"
                    value={cartaoNome}
                    onChangeText={(t) => setCartaoNome(t.toUpperCase())}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      style={[styles.cardInput, { flex: 1, marginBottom: 0 }]}
                      placeholder="Validade (MM/AA)"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={cartaoValidade}
                      onChangeText={(t) => setCartaoValidade(formatarValidadeCartao(t))}
                    />
                    <TextInput
                      style={[styles.cardInput, { flex: 1, marginBottom: 0 }]}
                      placeholder="CVV"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      maxLength={4}
                      value={cartaoCvv}
                      onChangeText={(t) => setCartaoCvv(t.replace(/\D/g, '').slice(0, 4))}
                    />
                  </View>
                </View>
              )}

              {/* BOTÃO DE CONFIRMAÇÃO */}
              <TouchableOpacity
                style={[
                  styles.generateButton,
                  (gerandoPagamento || valorNumerico <= 0) && styles.generateButtonDisabled,
                ]}
                onPress={handleGerarPagamento}
                disabled={gerandoPagamento || valorNumerico <= 0}
                activeOpacity={0.85}
              >
                {gerandoPagamento ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
                    <Text style={styles.generateButtonText}>
                      {valorNumerico > 0
                        ? `GERAR ${
                            formaPagamento === 'pix'
                              ? `PIX (${gatewayAtivo.toUpperCase()})`
                              : formaPagamento === 'cartao'
                              ? 'PAGAMENTO'
                              : 'BOLETO'
                          } DE ${formatarMoeda(valorNumerico)}`
                        : 'INFORME UM VALOR PARA CONTINUAR'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* HISTÓRICO RECENTE DE RECARGAS */}
              {historicoRecargas.length > 0 && (
                <View style={styles.historyCard}>
                  <Text style={styles.historyTitle}>
                    ÚLTIMAS RECARGAS • {alunoSelecionado?.nome.split(' ')[0].toUpperCase()}
                  </Text>
                  {historicoRecargas.map((item) => {
                    const st = item.status.toLowerCase()
                    const pago =
                      st.includes('aprov') ||
                      st.includes('pago') ||
                      st.includes('confirm') ||
                      st.includes('received')

                    return (
                      <View key={item.id} style={styles.historyRow}>
                        <View>
                          <Text style={styles.historyVal}>{formatarMoeda(item.valor)}</Text>
                          <Text style={styles.historyMeta}>
                            {item.metodo.toUpperCase()} •{' '}
                            {new Date(item.created_at).toLocaleDateString('pt-BR')}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.historyBadge,
                            pago
                              ? { backgroundColor: '#DCFCE7', color: '#15803D' }
                              : { backgroundColor: '#FEF3C7', color: '#B45309' },
                          ]}
                        >
                          {pago ? 'CONFIRMADA' : 'PENDENTE'}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-circle-outline" size={42} color="#1E62D0" />
              </View>
              <Text style={styles.emptyTitle}>Nenhum dependente encontrado</Text>
              <Text style={styles.emptySub}>
                Vincule seus filhos na aba Dependentes para efetuar recargas e configurar limites.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* MODAL DE AJUSTE DE LIMITE DIÁRIO */}
      <Modal
        visible={modalLimite}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!salvandoLimite) setModalLimite(false)
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTag}>CONTROLE PARENTAL</Text>
            <Text style={styles.modalTitle}>Ajustar Limite Diário</Text>
            <Text style={styles.modalSub}>
              Defina o valor máximo que{' '}
              <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                {alunoSelecionado?.nome}
              </Text>{' '}
              pode gastar por dia na cantina:
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Ex: 25,00"
              keyboardType="numeric"
              value={novoLimite}
              onChangeText={setNovoLimite}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setModalLimite(false)}
                disabled={salvandoLimite}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={salvarLimiteDiario}
                disabled={salvandoLimite}
              >
                {salvandoLimite ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Salvar Limite</Text>
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
    position: 'relative',
    overflow: 'hidden',
  },
  topAccentCircle: {
    position: 'absolute',
    right: -50,
    top: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#2853A4',
    opacity: 0.45,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerBadge: {
    backgroundColor: '#F27835',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  gatewaySwitchRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    padding: 3,
    gap: 4,
  },
  gatewayPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  gatewayPillActive: {
    backgroundColor: '#FFFFFF',
  },
  gatewayPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#CBD5E1',
  },
  gatewayPillTextActive: {
    color: '#1E2B58',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 2,
  },
  bodySheet: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  mainWrapper: {
    width: '100%',
  },
  mainWrapperTablet: {
    maxWidth: 720,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  minValueHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 12,
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
    minHeight: 145,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentCardSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
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
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E62D0',
  },
  avatarInitialSelected: {
    color: '#FFFFFF',
  },
  studentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    width: '100%',
  },
  studentNameSelected: {
    color: '#FFFFFF',
  },
  saldoBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
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
  saldoBaixoMiniTag: {
    fontSize: 8,
    fontWeight: '900',
    color: '#D97706',
    marginTop: 3,
  },
  controlBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
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
    color: '#1E293B',
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
    fontSize: 15,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 2,
  },
  controlBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  controlBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E62D0',
  },
  quickValuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  quickValueChip: {
    minWidth: '30%',
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickValueChipSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  quickValueText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
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
    marginBottom: 12,
  },
  currencyPrefix: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 10,
  },
  customValueInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  projectionBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 20,
  },
  projectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  projectionOld: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  projectionNew: {
    fontSize: 14,
    fontWeight: '900',
    color: '#16A34A',
  },
  metodosWrapper: {
    gap: 10,
    marginBottom: 16,
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
  metodoCardPixSel: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  metodoCardSelected: {
    borderColor: '#1E62D0',
    backgroundColor: '#EFF6FF',
  },
  metodoCardBoletoSel: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  metodoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  metodoTitleSelected: {
    color: '#1E62D0',
  },
  metodoSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  cardFormBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 16,
  },
  cardFormTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
  },
  cardInput: {
    height: 44,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 10,
  },
  generateButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: '#F27835',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#F27835',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  generateButtonDisabled: {
    backgroundColor: '#94A3B8',
    elevation: 0,
    shadowOpacity: 0,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  pixBoxContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmedIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmedBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#15803D',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  waitingPixBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 8,
  },
  waitingPixBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400E',
  },
  pixValorGrande: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  pixBoxTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  pixBoxSub: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  qrCodeWrapper: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  qrCodeImage: {
    width: 190,
    height: 190,
  },
  pixHelperText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 16,
  },
  copyColaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E62D0',
    borderRadius: 999,
    paddingHorizontal: 18,
    height: 48,
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
  monitoringBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 14,
    padding: 12,
    width: '100%',
    marginTop: 14,
  },
  monitoringText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  verifyNowBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  verifyNowBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E62D0',
  },
  newRechargeLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 8,
  },
  newRechargeLinkText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  historyVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  historyMeta: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  historyBadge: {
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  emptyContainer: {
    alignItems: 'center',
    marginVertical: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 32,
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
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  modalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F27835',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  modalSave: {
    flex: 1,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#1E62D0',
  },
  modalSaveText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})