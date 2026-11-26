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
  StatusBar,
  Linking,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

interface Dependente {
  id: string
  nome: string
  matricula?: string
  turma?: string
  serie?: string
  turno?: string
  saldo: number
  limite_diario: number
  gasto_hoje: number
  gasto_mes: number
  avatar_url?: string | null
  cartao_bloqueado: boolean
  tipo: 'aluno' | 'responsavel'
  alergias?: string
  restricoes_salvas?: string[]
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

interface AlunoValidadoPreview {
  id: string
  nomeCompleto: string
  nomeMascarado: string
  matricula: string
  turma?: string | null
  serie?: string | null
  jaVinculado: boolean
}

interface SolicitacaoReembolsoRow {
  id: string
  aluno_id: string
  valor_solicitado: number
  tipo_chave_pix: string
  chave_pix_destino: string
  titular_nome: string | null
  titular_cpf: string | null
  motivo: string
  status: 'pendente' | 'aprovado_pago' | 'recusado'
  observacao_admin: string | null
  comprovante_url: string | null
  created_at: string
}

const RESTRICOES_PADRAO: Restricao[] = [
  { id: '1', nome: 'Lactose / Derivados de Leite', ativo: false, icone: 'nutrition-outline' },
  { id: '2', nome: 'Glúten', ativo: false, icone: 'cafe-outline' },
  { id: '3', nome: 'Refrigerantes & Industrializados', ativo: false, icone: 'beaker-outline' },
  { id: '4', nome: 'Doces & Chocolates em excesso', ativo: false, icone: 'ice-cream-outline' },
  { id: '5', nome: 'Amendoim & Oleaginosas', ativo: false, icone: 'alert-circle-outline' },
]

const MOTIVOS_REEMBOLSO = [
  'Encerramento / Mudança de escola',
  'Recarga feita por engano / valor duplicado',
  'Encerramento do ano letivo',
  'Outro motivo',
]

const formatarMoeda = (valor: number) =>
  `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`

function formatarCPF(valor: string): string {
  const digits = valor.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function mascararNomeLGPD(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length <= 1) return nome
  return partes
    .map((p, idx) => {
      if (idx === 0 || idx === partes.length - 1) return p
      return `${p.charAt(0)}***`
    })
    .join(' ')
}

function normalizarDataNascimento(valor: string): string {
  const limpo = valor.trim()
  const brMatch = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`
  }
  return limpo
}

export default function DependentesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [alunoSelecionado, setAlunoSelecionado] = useState<Dependente | null>(null)
  const [ultimasCompras, setUltimasCompras] = useState<CompraRecente[]>([])
  const [solicitacoesReembolso, setSolicitacoesReembolso] = useState<SolicitacaoReembolsoRow[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [ativandoTitular, setAtivandoTitular] = useState(false)
  const [processandoBloqueio, setProcessandoBloqueio] = useState(false)

  // Modal Limite Diário
  const [modalLimiteVisible, setModalLimiteVisible] = useState(false)
  const [novoLimite, setNovoLimite] = useState<string>('')
  const [salvandoLimite, setSalvandoLimite] = useState(false)

  // Modal Editar Dados
  const [modalEditarVisible, setModalEditarVisible] = useState(false)
  const [editNome, setEditNome] = useState('')
  const [editTurma, setEditTurma] = useState('')
  const [editSerie, setEditSerie] = useState('')
  const [editTurno, setEditTurno] = useState('')
  const [salvandoCadastro, setSalvandoCadastro] = useState(false)

  // Modal Restrições & Alergias
  const [modalRestricoesVisible, setModalRestricoesVisible] = useState(false)
  const [restricoes, setRestricoes] = useState<Restricao[]>(RESTRICOES_PADRAO)
  const [alergiaTextoLivre, setAlergiaTextoLivre] = useState('')
  const [salvandoRestricoes, setSalvandoRestricoes] = useState(false)

  // Modal PIN do Totem
  const [modalPinVisible, setModalPinVisible] = useState(false)
  const [novoPin, setNovoPin] = useState('')
  const [confirmarPin, setConfirmarPin] = useState('')
  const [erroPin, setErroPin] = useState('')
  const [salvandoPin, setSalvandoPin] = useState(false)

  // Modal Vincular Novo Dependente (LGPD)
  const [modalVincularVisible, setModalVincularVisible] = useState(false)
  const [identificadorBusca, setIdentificadorBusca] = useState('')
  const [dataNascBusca, setDataNascBusca] = useState('')
  const [parentescoBusca, setParentescoBusca] = useState<'pai' | 'mae' | 'responsavel' | 'outro'>('responsavel')
  const [aceiteLgpd, setAceiteLgpd] = useState(false)
  const [buscandoAluno, setBuscandoAluno] = useState(false)
  const [alunoValidado, setAlunoValidado] = useState<AlunoValidadoPreview | null>(null)
  const [vinculandoAluno, setVinculandoAluno] = useState(false)
  const [erroVincular, setErroVincular] = useState('')

  // Modal Transferência & Reembolso (Idêntico ao Portal Web)
  const [modalFinanceiroVisible, setModalFinanceiroVisible] = useState(false)
  const [abaFinanceira, setAbaFinanceira] = useState<'reembolso' | 'transferencia'>('reembolso')

  // Estados — Transferência
  const [origemTransferId, setOrigemTransferId] = useState('')
  const [destinoTransferId, setDestinoTransferId] = useState('')
  const [valorTransferencia, setValorTransferencia] = useState('')
  const [transferindo, setTransferindo] = useState(false)

  // Estados — Reembolso Integral PIX
  const [reembolsoAlunoId, setReembolsoAlunoId] = useState('')
  const [tipoChavePix, setTipoChavePix] = useState<'cpf' | 'email' | 'telefone' | 'aleatoria'>('cpf')
  const [chavePix, setChavePix] = useState('')
  const [titularNome, setTitularNome] = useState('')
  const [titularCpf, setTitularCpf] = useState('')
  const [motivoSelect, setMotivoSelect] = useState(MOTIVOS_REEMBOLSO[0])
  const [motivoDetalhes, setMotivoDetalhes] = useState('')
  const [cienteBloqueio, setCienteBloqueio] = useState(false)
  const [solicitandoReembolso, setSolicitandoReembolso] = useState(false)
  const [erroFinanceiro, setErroFinanceiro] = useState('')

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  const sincronizarRestricoesAluno = useCallback((aluno: Dependente | null) => {
    const ativas = aluno?.restricoes_salvas || []
    setAlergiaTextoLivre(aluno?.alergias || '')
    setRestricoes(
      RESTRICOES_PADRAO.map((r) => ({
        ...r,
        ativo: ativas.includes(r.nome),
      }))
    )
  }, [])

  const fetchComprasDetalhadas = useCallback(async (alunoId: string) => {
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
        setUltimasCompras([])
      }
    } catch {
      setUltimasCompras([])
    }
  }, [])

  const fetchDados = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: perfil }, { data: usuario }] = await Promise.all([
        supabase.from('perfis').select('id, nome').eq('id', user.id).maybeSingle(),
        supabase
          .from('usuarios')
          .select('*')
          .or(`id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle(),
      ])

      if (usuario) {
        const u = usuario as Record<string, unknown>
        if (typeof u.nome === 'string' && u.nome.trim()) {
          setTitularNome((prev) => prev || u.nome!.toString().toUpperCase())
        }
        const cpfEncontrado = String(u.cpf || u.documento || '').replace(/\D/g, '')
        if (cpfEncontrado.length === 11) {
          setTitularCpf((prev) => prev || formatarCPF(cpfEncontrado))
          setChavePix((prev) => prev || formatarCPF(cpfEncontrado))
        }
      }

      const responsavelId = usuario?.id || perfil?.id || user.id
      const mapaAlunos = new Map<string, any>()

      // 1. Busca alunos diretos
      const { data: diretos } = await supabase
        .from('alunos')
        .select('*')
        .eq('responsavel_id', responsavelId)
        .order('nome', { ascending: true })

      if (diretos) {
        diretos.forEach((a: any) => mapaAlunos.set(String(a.id), a))
      }

      // 2. Busca vínculos nas tabelas pivô (plural e singular)
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

      // Busca solicitações de reembolso
      try {
        const { data: solData } = await supabase
          .from('solicitacoes_reembolso')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20)
        setSolicitacoesReembolso((solData as SolicitacaoReembolsoRow[]) || [])
      } catch {
        setSolicitacoesReembolso([])
      }

      if (alunosLista.length === 0) {
        setDependentes([])
        setAlunoSelecionado(null)
        return
      }

      const alunoIds = alunosLista.map((a: any) => a.id)

      const carteirasMap: Record<
        string,
        { saldo: number; limite_diario: number; bloqueada: boolean }
      > = {}
      try {
        const { data: carteirasData } = await supabase
          .from('carteiras')
          .select('*')
          .in('aluno_id', alunoIds)

        if (carteirasData) {
          carteirasData.forEach((c: any) => {
            const valSaldo = Number(c.saldo ?? c.saldo_dinheiro ?? c.saldo_atual ?? c.valor ?? 0)
            const valLimite = Number(c.limite_diario ?? c.limite ?? 0)
            const isBloq = Boolean(c.bloqueada || c.bloqueado || c.status === 'bloqueado')
            carteirasMap[String(c.aluno_id)] = {
              saldo: valSaldo,
              limite_diario: valLimite,
              bloqueada: isBloq,
            }
          })
        }
      } catch (e) {
        console.log('Erro ao consultar carteiras:', e)
      }

      const hojeIso = new Date().toISOString().split('T')[0]
      const primeiroDiaMes = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString()

      const gastosHojeMap: Record<string, number> = {}
      const gastosMesMap: Record<string, number> = {}

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
            : Number(a.limite_diario ?? a.limite ?? 0)

        const bloqueadoFinal = Boolean(
          infoCarteira?.bloqueada || a.cartao_bloqueado === true || a.bloqueado === true
        )

        const foto =
          a.foto_facial_url || a.foto_url || a.avatar_url || a.foto || a.avatar || null

        let restricoesArray: string[] = []
        if (Array.isArray(a.restricoes)) {
          restricoesArray = a.restricoes
        } else if (typeof a.restricoes === 'string' && a.restricoes.trim()) {
          restricoesArray = a.restricoes.split(',').map((s: string) => s.trim())
        } else if (typeof a.restricoes_alimentares === 'string' && a.restricoes_alimentares.trim()) {
          restricoesArray = a.restricoes_alimentares.split(',').map((s: string) => s.trim())
        }

        const ehResponsavel = a.tipo === 'responsavel' || Boolean(a.is_self)

        return {
          id: aid,
          nome: a.nome || 'Aluno',
          matricula: a.matricula || '',
          turma: a.turma || '',
          serie: a.serie || a.grau || (ehResponsavel ? 'Carteira Titular' : ''),
          turno: a.turno || '',
          saldo: saldoFinal,
          limite_diario: limiteFinal,
          gasto_hoje: gastosHojeMap[aid] || 0,
          gasto_mes: gastosMesMap[aid] || 0,
          avatar_url: foto,
          cartao_bloqueado: bloqueadoFinal,
          tipo: ehResponsavel ? 'responsavel' : 'aluno',
          alergias: a.alergias || a.restricoes_alimentares || '',
          restricoes_salvas: restricoesArray,
        }
      })

      setDependentes(mapeados)

      setAlunoSelecionado((prev) => {
        const atual = prev ? mapeados.find((m) => m.id === prev.id) || mapeados[0] : mapeados[0]
        if (atual) {
          setNovoLimite(atual.limite_diario ? String(atual.limite_diario) : '0')
          sincronizarRestricoesAluno(atual)
          fetchComprasDetalhadas(atual.id)
        }
        return atual || null
      })
    } catch (err) {
      console.error('Erro ao buscar dependentes:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetchComprasDetalhadas, sincronizarRestricoesAluno])

  useEffect(() => {
    fetchDados()
  }, [fetchDados])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchDados()
  }, [fetchDados])

  const possuiCarteiraPessoal = dependentes.some((d) => d.tipo === 'responsavel')

  const handleSelecionarAluno = (aluno: Dependente) => {
    setAlunoSelecionado(aluno)
    setNovoLimite(aluno.limite_diario ? String(aluno.limite_diario) : '0')
    sincronizarRestricoesAluno(aluno)
    fetchComprasDetalhadas(aluno.id)
  }

  // =========================================================================
  // 1. ATIVAR MINHA CARTEIRA PESSOAL (TITULAR)
  // =========================================================================
  const handleAtivarMinhaCarteira = async () => {
    if (ativandoTitular) return
    setAtivandoTitular(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, nome, escola_id')
        .or(`id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle()

      const { data: perfil } = await supabase
        .from('perfis')
        .select('id, nome')
        .eq('id', user.id)
        .maybeSingle()

      const responsavelId = usuario?.id || perfil?.id || user.id
      const nomeTitular =
        usuario?.nome ||
        perfil?.nome ||
        user.user_metadata?.nome ||
        user.email?.split('@')[0] ||
        'Responsável Titular'

      let escolaId: string | null = usuario?.escola_id || null
      if (!escolaId) {
        const { data: escolaAtiva } = await supabase
          .from('escola')
          .select('id')
          .limit(1)
          .maybeSingle()
        escolaId = escolaAtiva?.id || null
      }

      const { data: existente } = await supabase
        .from('alunos')
        .select('id')
        .eq('responsavel_id', responsavelId)
        .eq('tipo', 'responsavel')
        .maybeSingle()

      if (existente) {
        mostrarAviso('Carteira Ativa', 'Sua carteira pessoal já está ativada!')
        await fetchDados()
        return
      }

      const matriculaTitular = `TIT-${Math.floor(100000 + Math.random() * 900000)}`

      const { data: novoTitular, error: errAluno } = await supabase
        .from('alunos')
        .insert({
          nome: String(nomeTitular).trim(),
          matricula: matriculaTitular,
          tipo: 'responsavel',
          responsavel_id: responsavelId,
          limite_diario: 0,
          ativo: true,
          ...(escolaId ? { escola_id: escolaId } : {}),
        })
        .select('id')
        .single()

      if (errAluno || !novoTitular) {
        throw new Error(errAluno?.message || 'Não foi possível criar a carteira titular.')
      }

      await supabase.from('carteiras').insert({
        aluno_id: novoTitular.id,
        saldo: 0,
        limite_diario: 0,
      })

      await Promise.allSettled([
        supabase.from('responsavel_aluno').insert({
          responsavel_id: responsavelId,
          aluno_id: novoTitular.id,
          tipo: 'titular',
          principal: true,
        }),
        supabase.from('responsaveis_alunos').insert({
          responsavel_id: responsavelId,
          aluno_id: novoTitular.id,
          parentesco: 'titular',
        }),
      ])

      mostrarAviso(
        'Carteira Ativada!',
        'Sua carteira pessoal foi criada e já está disponível no portal, admin e totem.'
      )
      await fetchDados()
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Erro ao ativar carteira pessoal.')
    } finally {
      setAtivandoTitular(false)
    }
  }

  // =========================================================================
  // 2. VINCULAR NOVO DEPENDENTE (LGPD)
  // =========================================================================
  const abrirModalVincular = () => {
    setIdentificadorBusca('')
    setDataNascBusca('')
    setParentescoBusca('responsavel')
    setAceiteLgpd(false)
    setAlunoValidado(null)
    setErroVincular('')
    setModalVincularVisible(true)
  }

  const handleValidarAlunoParaVinculo = async () => {
    const termo = identificadorBusca.trim().replace(/\s+/g, ' ')
    const dataIso = normalizarDataNascimento(dataNascBusca)

    if (!termo || !dataIso) {
      setErroVincular('Informe o nome completo ou a matrícula e a data de nascimento (DD/MM/AAAA).')
      return
    }

    setBuscandoAluno(true)
    setErroVincular('')
    setAlunoValidado(null)
    setAceiteLgpd(false)

    try {
      const { data: candidatos, error } = await supabase
        .from('alunos')
        .select('id, nome, matricula, turma, serie, data_nascimento, responsavel_id')
        .or(`matricula.ilike.${termo},nome.ilike.${termo}`)
        .limit(10)

      if (error) {
        throw new Error('Não foi possível consultar o cadastro escolar.')
      }

      const encontrado = (candidatos || []).find((c: any) => {
        if (!c.data_nascimento) return false
        const nascBanco = String(c.data_nascimento).split('T')[0]
        return nascBanco === dataIso
      })

      if (!encontrado) {
        setErroVincular(
          'Dados não conferem. Verifique se o nome completo ou a matrícula e a data de nascimento estão corretos.'
        )
        return
      }

      const jaEstaNaLista = dependentes.some((d) => d.id === String(encontrado.id))

      setAlunoValidado({
        id: String(encontrado.id),
        nomeCompleto: encontrado.nome,
        nomeMascarado: mascararNomeLGPD(encontrado.nome),
        matricula: encontrado.matricula || '—',
        turma: encontrado.turma,
        serie: encontrado.serie,
        jaVinculado: jaEstaNaLista,
      })
    } catch (err: any) {
      setErroVincular(err.message || 'Erro ao localizar aluno.')
    } finally {
      setBuscandoAluno(false)
    }
  }

  const handleConfirmarVinculo = async () => {
    if (!alunoValidado) return
    if (!aceiteLgpd) {
      setErroVincular('Confirme a declaração de responsabilidade legal (Art. 14 da LGPD).')
      return
    }

    setVinculandoAluno(true)
    setErroVincular('')

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

      await supabase
        .from('alunos')
        .update({ responsavel_id: responsavelId })
        .eq('id', alunoValidado.id)
        .is('responsavel_id', null)

      const [resPlural, resSingular] = await Promise.allSettled([
        supabase.from('responsaveis_alunos').upsert(
          {
            responsavel_id: responsavelId,
            aluno_id: alunoValidado.id,
            parentesco: parentescoBusca,
          },
          { onConflict: 'responsavel_id,aluno_id' }
        ),
        supabase.from('responsavel_aluno').upsert(
          {
            responsavel_id: responsavelId,
            aluno_id: alunoValidado.id,
            tipo: parentescoBusca,
            principal: true,
          },
          { onConflict: 'responsavel_id,aluno_id' }
        ),
      ])

      if (resPlural.status === 'rejected' && resSingular.status === 'rejected') {
        throw new Error('Não foi possível registrar o vínculo no banco de dados.')
      }

      setModalVincularVisible(false)
      mostrarAviso(
        'Dependente Vinculado!',
        `${alunoValidado.nomeCompleto} agora está vinculado à sua conta.`
      )
      await fetchDados()
    } catch (err: any) {
      setErroVincular(err.message || 'Erro ao concluir vínculo.')
    } finally {
      setVinculandoAluno(false)
    }
  }

  // =========================================================================
  // 3. TRANSFERÊNCIA & REEMBOLSO INTEGRAL (USANDO AS RPCS DO PORTAL WEB)
  // =========================================================================
  const abrirModalFinanceiro = (abaInicial: 'reembolso' | 'transferencia' = 'reembolso') => {
    setAbaFinanceira(abaInicial)
    setErroFinanceiro('')
    setCienteBloqueio(false)
    setMotivoDetalhes('')
    setValorTransferencia('')

    if (dependentes.length > 0) {
      const atualId = alunoSelecionado?.id || dependentes[0].id
      setReembolsoAlunoId(atualId)
      setOrigemTransferId(atualId)
      const outro = dependentes.find((d) => d.id !== atualId)
      setDestinoTransferId(outro ? outro.id : '')
    }

    setModalFinanceiroVisible(true)
  }

  const carteiraReembolso = dependentes.find((c) => c.id === reembolsoAlunoId)
  const carteiraOrigem = dependentes.find((c) => c.id === origemTransferId)
  const jaPossuiSolicitacaoPendente = Boolean(
    reembolsoAlunoId &&
      solicitacoesReembolso.some((s) => s.aluno_id === reembolsoAlunoId && s.status === 'pendente')
  )

  const handleConfirmarTransferenciaRPC = async () => {
    setErroFinanceiro('')
    const valorNum = parseFloat(valorTransferencia.replace(',', '.'))

    if (!origemTransferId || !destinoTransferId || origemTransferId === destinoTransferId) {
      setErroFinanceiro('Selecione carteiras diferentes de origem e destino.')
      return
    }
    if (isNaN(valorNum) || valorNum <= 0) {
      setErroFinanceiro('Informe um valor válido maior que R$ 0,00.')
      return
    }
    if (carteiraOrigem && valorNum > carteiraOrigem.saldo) {
      setErroFinanceiro('Saldo insuficiente na carteira de origem.')
      return
    }

    setTransferindo(true)
    try {
      const { error } = await supabase.rpc('transferir_saldo_carteiras', {
        p_origem_aluno_id: origemTransferId,
        p_destino_aluno_id: destinoTransferId,
        p_valor: valorNum,
      })

      if (error) throw new Error(error.message)

      setModalFinanceiroVisible(false)
      setValorTransferencia('')
      mostrarAviso(
        'Transferência Concluída!',
        `Transferência de ${formatarMoeda(valorNum)} concluída instantaneamente!`
      )
      await fetchDados()
    } catch (err: any) {
      setErroFinanceiro(err.message || 'Erro ao realizar transferência.')
    } finally {
      setTransferindo(false)
    }
  }

  const handleSolicitarReembolsoRPC = async () => {
    setErroFinanceiro('')

    if (!carteiraReembolso) {
      setErroFinanceiro('Selecione uma carteira.')
      return
    }
    if (carteiraReembolso.saldo <= 0) {
      setErroFinanceiro('Esta carteira não possui saldo disponível para reembolso.')
      return
    }
    if (jaPossuiSolicitacaoPendente) {
      setErroFinanceiro('Já existe uma solicitação em análise para esta carteira.')
      return
    }
    if (!chavePix.trim()) {
      setErroFinanceiro('Informe a chave PIX de destino.')
      return
    }
    if (!titularNome.trim() || titularCpf.replace(/\D/g, '').length !== 11) {
      setErroFinanceiro('Informe o nome completo e um CPF válido (11 dígitos) do titular.')
      return
    }
    if (!cienteBloqueio) {
      setErroFinanceiro('Confirme que está ciente da reserva do saldo e bloqueio preventivo.')
      return
    }

    const motivoFinal = motivoDetalhes.trim()
      ? `${motivoSelect} — ${motivoDetalhes.trim()}`
      : motivoSelect

    setSolicitandoReembolso(true)
    try {
      const { error } = await supabase.rpc('solicitar_reembolso_integral', {
        p_aluno_id: carteiraReembolso.id,
        p_tipo_chave_pix: tipoChavePix,
        p_chave_pix: chavePix.trim(),
        p_titular_nome: titularNome.trim().toUpperCase(),
        p_titular_cpf: titularCpf.replace(/\D/g, ''),
        p_motivo: motivoFinal,
      })

      if (error) throw new Error(error.message)

      const valorSolicitado = carteiraReembolso.saldo
      setModalFinanceiroVisible(false)
      setMotivoDetalhes('')
      setCienteBloqueio(false)

      mostrarAviso(
        'Solicitação Registrada!',
        `Reembolso integral (${formatarMoeda(valorSolicitado)}) registrado! O saldo foi reservado e será processado pela cantina em até 5 dias úteis.`
      )
      await fetchDados()
    } catch (err: any) {
      setErroFinanceiro(err.message || 'Erro ao registrar solicitação de reembolso.')
    } finally {
      setSolicitandoReembolso(false)
    }
  }

  // =========================================================================
  // 4. BLOQUEIO PREVENTIVO DE CARTÃO
  // =========================================================================
  const handleAlternarBloqueio = async () => {
    if (!alunoSelecionado || processandoBloqueio) return
    const novoStatus = !alunoSelecionado.cartao_bloqueado
    setProcessandoBloqueio(true)
    try {
      await Promise.all([
        supabase
          .from('alunos')
          .update({ cartao_bloqueado: novoStatus })
          .eq('id', alunoSelecionado.id),
        supabase
          .from('carteiras')
          .update({ bloqueada: novoStatus })
          .eq('aluno_id', alunoSelecionado.id),
      ])

      setDependentes((prev) =>
        prev.map((d) =>
          d.id === alunoSelecionado.id ? { ...d, cartao_bloqueado: novoStatus } : d
        )
      )
      setAlunoSelecionado((prev) =>
        prev ? { ...prev, cartao_bloqueado: novoStatus } : null
      )

      mostrarAviso(
        novoStatus ? 'Cartão Bloqueado' : 'Cartão Desbloqueado',
        novoStatus
          ? `O consumo de ${alunoSelecionado.nome.split(' ')[0]} foi bloqueado preventivamente no totem e na cantina.`
          : `O cartão de ${alunoSelecionado.nome.split(' ')[0]} voltou a ficar ativo para consumo.`
      )
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Não foi possível alterar o status do cartão.')
    } finally {
      setProcessandoBloqueio(false)
    }
  }

  // =========================================================================
  // 5. DEFINIR PIN DO TOTEM
  // =========================================================================
  const handleAbrirModalPin = () => {
    if (!alunoSelecionado) return
    setNovoPin('')
    setConfirmarPin('')
    setErroPin('')
    setModalPinVisible(true)
  }

  const handleSalvarPinTotem = async () => {
    if (!alunoSelecionado) return
    const pinLimpo = novoPin.replace(/\D/g, '')
    const confLimpo = confirmarPin.replace(/\D/g, '')

    if (pinLimpo.length < 4 || pinLimpo.length > 6) {
      setErroPin('O PIN deve ter entre 4 e 6 dígitos numéricos.')
      return
    }
    if (pinLimpo !== confLimpo) {
      setErroPin('Os dois campos de PIN não coincidem.')
      return
    }

    setSalvandoPin(true)
    setErroPin('')
    try {
      const { error } = await supabase.rpc('definir_pin_dependente', {
        p_aluno_id: alunoSelecionado.id,
        p_novo_pin: pinLimpo,
      })

      if (error) {
        throw new Error(error.message || 'Não foi possível salvar o PIN.')
      }

      setModalPinVisible(false)
      mostrarAviso(
        'PIN Atualizado',
        `Senha PIN do Totem definida com sucesso para ${alunoSelecionado.nome}!`
      )
    } catch (err: any) {
      setErroPin(err.message || 'Erro ao definir PIN do Totem.')
    } finally {
      setSalvandoPin(false)
    }
  }

  // =========================================================================
  // 6. LIMITE DIÁRIO, DADOS CADASTRAIS E RESTRIÇÕES ALIMENTARES
  // =========================================================================
  const handleAbrirModalLimite = (alunoAlvo?: Dependente) => {
    const alvo = alunoAlvo || alunoSelecionado
    if (!alvo) return
    if (alunoAlvo && alunoAlvo.id !== alunoSelecionado?.id) {
      handleSelecionarAluno(alunoAlvo)
    }
    setNovoLimite(String(alvo.limite_diario || 0))
    setModalLimiteVisible(true)
  }

  const handleSalvarLimiteModal = async () => {
    if (!alunoSelecionado) return
    setSalvandoLimite(true)
    try {
      const valNum = novoLimite ? parseFloat(novoLimite.replace(',', '.')) : 0
      if (isNaN(valNum) || valNum < 0) {
        mostrarAviso('Atenção', 'Informe um valor válido para o limite diário.')
        return
      }

      await Promise.all([
        supabase
          .from('carteiras')
          .update({ limite_diario: valNum })
          .eq('aluno_id', alunoSelecionado.id),
        supabase
          .from('alunos')
          .update({ limite_diario: valNum })
          .eq('id', alunoSelecionado.id),
      ])

      mostrarAviso('Sucesso', 'Limite diário alterado com sucesso!')
      setModalLimiteVisible(false)
      fetchDados()
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Erro ao atualizar o limite.')
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
    if (!editNome.trim()) {
      mostrarAviso('Atenção', 'O nome do aluno não pode ficar vazio.')
      return
    }

    setSalvandoCadastro(true)
    try {
      const { error } = await supabase
        .from('alunos')
        .update({
          nome: editNome.trim(),
          turma: editTurma.trim() || null,
          serie: editSerie.trim() || null,
          turno: editTurno.trim() || null,
        })
        .eq('id', alunoSelecionado.id)

      if (error) throw error

      mostrarAviso('Sucesso', 'Dados atualizados com sucesso!')
      setModalEditarVisible(false)
      fetchDados()
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Erro ao atualizar o cadastro.')
    } finally {
      setSalvandoCadastro(false)
    }
  }

  const toggleRestricao = (id: string) => {
    setRestricoes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r))
    )
  }

  const handleSalvarRestricoes = async () => {
    if (!alunoSelecionado) return
    setSalvandoRestricoes(true)
    try {
      const selecionadas = restricoes.filter((r) => r.ativo).map((r) => r.nome)
      const livre = alergiaTextoLivre.trim()
      const partesResumo = [...selecionadas, ...(livre ? [livre] : [])]
      const textoFinal = partesResumo.join(', ')

      await supabase
        .from('alunos')
        .update({
          alergias: textoFinal || null,
          restricoes_alimentares: textoFinal || null,
        })
        .eq('id', alunoSelecionado.id)

      setDependentes((prev) =>
        prev.map((d) =>
          d.id === alunoSelecionado.id
            ? { ...d, alergias: textoFinal, restricoes_salvas: selecionadas }
            : d
        )
      )
      setAlunoSelecionado((prev) =>
        prev ? { ...prev, alergias: textoFinal, restricoes_salvas: selecionadas } : null
      )

      mostrarAviso(
        'Restrições Atualizadas',
        'Restrições salvas! O caixa da cantina e o totem serão alertados ao atender.'
      )
      setModalRestricoesVisible(false)
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Não foi possível salvar as restrições.')
    } finally {
      setSalvandoRestricoes(false)
    }
  }

  const gastoHoje = alunoSelecionado?.gasto_hoje || 0
  const limiteDiario = alunoSelecionado?.limite_diario || 0
  const porcentagemUso =
    limiteDiario > 0 ? Math.min(Math.round((gastoHoje / limiteDiario) * 100), 100) : 0

  const getStatusColor = () => {
    if (porcentagemUso >= 90) return '#E11D48'
    if (porcentagemUso >= 70) return '#F27835'
    return '#16A34A'
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
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>GESTÃO FAMILIAR & TITULAR</Text>
        </View>
        <Text style={styles.title}>Carteiras & Dependentes</Text>
        <Text style={styles.subtitle}>
          Vincule dependentes, transfira saldo, solicite reembolso PIX ou configure o Totem
        </Text>

        {/* Barra de Ações Globais (Espelho do Portal Web) */}
        <View style={styles.globalActionsRow}>
          <TouchableOpacity
            style={styles.primaryGlobalBtn}
            onPress={abrirModalVincular}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={15} color="#FFFFFF" />
            <Text style={styles.primaryGlobalBtnText}>VINCULAR DEPENDENTE</Text>
          </TouchableOpacity>

          {!possuiCarteiraPessoal && (
            <TouchableOpacity
              style={styles.emeraldGlobalBtn}
              onPress={handleAtivarMinhaCarteira}
              disabled={ativandoTitular}
              activeOpacity={0.85}
            >
              {ativandoTitular ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="wallet-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.primaryGlobalBtnText}>MINHA CARTEIRA</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {dependentes.length > 0 && (
            <TouchableOpacity
              style={styles.secondaryGlobalBtn}
              onPress={() => abrirModalFinanceiro('reembolso')}
              activeOpacity={0.85}
            >
              <Ionicons name="swap-horizontal" size={15} color="#FFFFFF" />
              <Text style={styles.primaryGlobalBtnText}>TRANSFERIR / REEMBOLSO</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Corpo Branco Arredondado */}
      <ScrollView
        style={styles.bodySheet}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 22,
          paddingBottom: Math.max(insets.bottom, 24) + 20,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E62D0']} />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color="#1E62D0" style={{ marginVertical: 48 }} />
        ) : dependentes.length > 0 ? (
          <>
            {/* Abas de Seleção de Carteiras */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectorRow}
            >
              {dependentes.map((dep) => {
                const isSelected = alunoSelecionado?.id === dep.id
                const ehTitular = dep.tipo === 'responsavel'
                return (
                  <View
                    key={dep.id}
                    style={[
                      styles.depTabCard,
                      isSelected &&
                        (ehTitular ? styles.depTabCardTitularSelected : styles.depTabCardSelected),
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.depTabContent}
                      onPress={() => handleSelecionarAluno(dep)}
                      activeOpacity={0.85}
                    >
                      {dep.avatar_url ? (
                        <Image source={{ uri: dep.avatar_url }} style={styles.tabAvatarImage} />
                      ) : (
                        <View
                          style={[
                            styles.tabAvatarBadge,
                            ehTitular && { backgroundColor: '#ECFDF5' },
                            isSelected && styles.tabAvatarBadgeSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.tabAvatarText,
                              ehTitular && { color: '#059669' },
                              isSelected && styles.tabAvatarTextSelected,
                            ]}
                          >
                            {dep.nome.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.tabName, isSelected && styles.tabNameSelected]}
                          numberOfLines={1}
                        >
                          {dep.nome.split(' ')[0]} {ehTitular ? '(Titular)' : ''}
                        </Text>
                        <Text style={[styles.tabSaldo, isSelected && styles.tabSaldoSelected]}>
                          {formatarMoeda(dep.saldo)}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.quickLimitBadgeBtn,
                        isSelected && styles.quickLimitBadgeBtnSelected,
                      ]}
                      onPress={() => handleAbrirModalLimite(dep)}
                    >
                      <Ionicons
                        name="options-outline"
                        size={16}
                        color={isSelected ? '#FFFFFF' : '#1E62D0'}
                      />
                    </TouchableOpacity>
                  </View>
                )
              })}
            </ScrollView>

            {/* Cartão Principal do Aluno / Titular */}
            {alunoSelecionado && (
              <View
                style={[
                  styles.mainProfileCard,
                  alunoSelecionado.cartao_bloqueado && { borderColor: '#FECDD3' },
                ]}
              >
                <View style={styles.profileHeaderRow}>
                  <View style={styles.profileLeftInfo}>
                    {alunoSelecionado.avatar_url ? (
                      <Image
                        source={{ uri: alunoSelecionado.avatar_url }}
                        style={styles.bigAvatarImage}
                      />
                    ) : (
                      <View
                        style={[
                          styles.bigAvatarBadge,
                          alunoSelecionado.tipo === 'responsavel' && { backgroundColor: '#ECFDF5' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.bigAvatarInitial,
                            alunoSelecionado.tipo === 'responsavel' && { color: '#059669' },
                          ]}
                        >
                          {alunoSelecionado.nome.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={styles.profileName}>{alunoSelecionado.nome}</Text>
                      <View style={styles.tagsRow}>
                        {alunoSelecionado.tipo === 'responsavel' ? (
                          <Text style={[styles.tagHighlight, { color: '#059669' }]}>
                            Carteira Titular • Uso Próprio na Cantina
                          </Text>
                        ) : (
                          <>
                            {!!alunoSelecionado.matricula && (
                              <>
                                <Text style={styles.tagText}>
                                  Mat: {alunoSelecionado.matricula}
                                </Text>
                                <Text style={styles.tagDot}>•</Text>
                              </>
                            )}
                            {!!alunoSelecionado.serie && (
                              <Text style={styles.tagText}>{alunoSelecionado.serie}</Text>
                            )}
                            {!!alunoSelecionado.turma && (
                              <>
                                <Text style={styles.tagDot}>•</Text>
                                <Text style={styles.tagText}>{alunoSelecionado.turma}</Text>
                              </>
                            )}
                            {!!alunoSelecionado.turno && (
                              <>
                                <Text style={styles.tagDot}>•</Text>
                                <Text style={styles.tagHighlight}>{alunoSelecionado.turno}</Text>
                              </>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusBadgeActive,
                      alunoSelecionado.cartao_bloqueado && {
                        backgroundColor: '#FFF1F2',
                        borderColor: '#FECDD3',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        alunoSelecionado.cartao_bloqueado && { backgroundColor: '#E11D48' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusTextActive,
                        alunoSelecionado.cartao_bloqueado && { color: '#E11D48' },
                      ]}
                    >
                      {alunoSelecionado.cartao_bloqueado ? 'Bloqueado' : 'Ativo'}
                    </Text>
                  </View>
                </View>

                {/* Banner de Saldo */}
                <View style={styles.saldoCardCompact}>
                  <View>
                    <Text style={styles.saldoCompactLabel}>SALDO DISPONÍVEL</Text>
                    <Text style={styles.saldoCompactValue}>
                      {formatarMoeda(alunoSelecionado.saldo)}
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

                {/* Grade de Controles */}
                <View style={styles.actionsGrid}>
                  <TouchableOpacity style={styles.actionBtn} onPress={handleAbrirModalEditar}>
                    <Ionicons name="create-outline" size={15} color="#1E62D0" />
                    <Text style={styles.actionBtnText}>Dados</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
                    ]}
                    onPress={handleAbrirModalPin}
                  >
                    <Ionicons name="key-outline" size={15} color="#059669" />
                    <Text style={[styles.actionBtnText, { color: '#047857' }]}>PIN Totem</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { borderColor: '#FDBA74', backgroundColor: '#FFF7ED' },
                    ]}
                    onPress={() => setModalRestricoesVisible(true)}
                  >
                    <Ionicons name="nutrition-outline" size={15} color="#F27835" />
                    <Text style={[styles.actionBtnText, { color: '#C2410C' }]}>Restrições</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => abrirModalFinanceiro('reembolso')}
                  >
                    <Ionicons name="cash-outline" size={15} color="#1E62D0" />
                    <Text style={styles.actionBtnText}>Reembolso</Text>
                  </TouchableOpacity>
                </View>

                {/* Botão de Bloqueio / Desbloqueio Preventivo */}
                <TouchableOpacity
                  style={[
                    styles.blockCardBtn,
                    alunoSelecionado.cartao_bloqueado
                      ? styles.unblockCardBtn
                      : styles.lockCardBtn,
                  ]}
                  onPress={handleAlternarBloqueio}
                  disabled={processandoBloqueio}
                  activeOpacity={0.85}
                >
                  {processandoBloqueio ? (
                    <ActivityIndicator
                      size="small"
                      color={alunoSelecionado.cartao_bloqueado ? '#15803D' : '#BE123C'}
                    />
                  ) : (
                    <>
                      <Ionicons
                        name={
                          alunoSelecionado.cartao_bloqueado
                            ? 'lock-open-outline'
                            : 'lock-closed-outline'
                        }
                        size={15}
                        color={alunoSelecionado.cartao_bloqueado ? '#15803D' : '#BE123C'}
                      />
                      <Text
                        style={[
                          styles.blockCardBtnText,
                          {
                            color: alunoSelecionado.cartao_bloqueado ? '#15803D' : '#BE123C',
                          },
                        ]}
                      >
                        {alunoSelecionado.cartao_bloqueado
                          ? 'Desbloquear Cartão'
                          : 'Bloquear Cartão Preventivamente'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Resumo de Restrições / Alergias Ativas */}
                {!!alunoSelecionado.alergias && (
                  <View style={styles.activeRestricoesBanner}>
                    <Ionicons name="alert-circle" size={16} color="#C2410C" />
                    <Text style={styles.activeRestricoesText}>
                      Restrições / Alergias: {alunoSelecionado.alergias}
                    </Text>
                  </View>
                )}

                <View style={styles.divider} />

                {/* Barra de Limite Diário */}
                <View style={styles.limitMetricIntegratedBox}>
                  <View style={styles.limitHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="speedometer-outline" size={18} color="#1E62D0" />
                      <Text style={styles.limitMetricTitle}>Consumo & Limite Diário</Text>
                    </View>

                    <TouchableOpacity onPress={() => handleAbrirModalLimite()}>
                      <Text style={styles.editLimitLink}>
                        {limiteDiario > 0
                          ? `Limite: ${formatarMoeda(limiteDiario)} ✏️`
                          : 'Sem Limite ✏️'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {limiteDiario > 0 ? (
                    <>
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
                          Gasto Hoje:{' '}
                          <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                            {formatarMoeda(gastoHoje)}
                          </Text>
                        </Text>
                        <Text style={[styles.progressFooterPercent, { color: getStatusColor() }]}>
                          {porcentagemUso}% utilizado
                        </Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.progressFooterText}>
                      Gasto Hoje:{' '}
                      <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                        {formatarMoeda(gastoHoje)}
                      </Text>{' '}
                      • Toque acima para definir um teto diário.
                    </Text>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Últimas Compras */}
                <Text style={styles.sectionHeaderTitle}>Últimas Compras</Text>

                {ultimasCompras.length > 0 ? (
                  ultimasCompras.map((compra) => (
                    <View key={compra.id} style={styles.receiptCard}>
                      <View style={styles.receiptHeader}>
                        <View style={styles.receiptDateGroup}>
                          <Ionicons name="receipt-outline" size={16} color="#F27835" />
                          <Text style={styles.receiptDateText}>{compra.data}</Text>
                        </View>
                        <Text style={styles.receiptTotalText}>
                          - {formatarMoeda(compra.valor_total)}
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
                              {formatarMoeda(item.preco_unitario * item.quantidade)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyComprasText}>
                    Nenhuma compra registrada recentemente.
                  </Text>
                )}
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="people-circle-outline" size={42} color="#1E62D0" />
            </View>
            <Text style={styles.emptyTitle}>Nenhuma carteira vinculada</Text>
            <Text style={styles.emptySub}>
              Vincule seu dependente pela matrícula ou ative sua carteira pessoal.
            </Text>

            <View style={styles.emptyButtonsColumn}>
              <TouchableOpacity
                style={styles.emptyPrimaryBtn}
                onPress={abrirModalVincular}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                <Text style={styles.emptyPrimaryBtnText}>+ VINCULAR DEPENDENTE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.emptySecondaryBtn}
                onPress={handleAtivarMinhaCarteira}
                disabled={ativandoTitular}
                activeOpacity={0.85}
              >
                <Ionicons name="wallet-outline" size={16} color="#059669" />
                <Text style={styles.emptySecondaryBtnText}>
                  {ativandoTitular ? 'ATIVANDO...' : '+ ATIVAR MINHA CARTEIRA PESSOAL'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* =================================================================== */}
      {/* MODAL TRANSFERÊNCIA & REEMBOLSO INTEGRAL (IDÊNTICO AO PORTAL WEB)   */}
      {/* =================================================================== */}
      <Modal
        visible={modalFinanceiroVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!transferindo && !solicitandoReembolso) setModalFinanceiroVisible(false)
        }}
      >
        <View style={styles.modalOverlayBottom}>
          <ScrollView
            style={styles.modalContentSheetScroll}
            contentContainerStyle={{ paddingBottom: 36 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTag}>GESTÃO DE SALDO</Text>
                <Text style={styles.modalTitle}>Transferência & Reembolso</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setModalFinanceiroVisible(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Seletor de Modo (Reembolso vs Transferência) */}
            <View style={styles.finTabsRow}>
              <TouchableOpacity
                style={[
                  styles.finTabBtn,
                  abaFinanceira === 'reembolso' && styles.finTabBtnActive,
                ]}
                onPress={() => {
                  setAbaFinanceira('reembolso')
                  setErroFinanceiro('')
                }}
              >
                <Ionicons
                  name="return-up-back"
                  size={16}
                  color={abaFinanceira === 'reembolso' ? '#FFFFFF' : '#1E62D0'}
                />
                <Text
                  style={[
                    styles.finTabBtnText,
                    abaFinanceira === 'reembolso' && styles.finTabBtnTextActive,
                  ]}
                >
                  Reembolso PIX
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.finTabBtn,
                  abaFinanceira === 'transferencia' && styles.finTabBtnActive,
                ]}
                onPress={() => {
                  setAbaFinanceira('transferencia')
                  setErroFinanceiro('')
                }}
              >
                <Ionicons
                  name="swap-horizontal"
                  size={16}
                  color={abaFinanceira === 'transferencia' ? '#FFFFFF' : '#059669'}
                />
                <Text
                  style={[
                    styles.finTabBtnText,
                    abaFinanceira === 'transferencia' && styles.finTabBtnTextActive,
                  ]}
                >
                  Transferir Saldo
                </Text>
              </TouchableOpacity>
            </View>

            {!!erroFinanceiro && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#E11D48" />
                <Text style={styles.errorBoxText}>{erroFinanceiro}</Text>
              </View>
            )}

            {abaFinanceira === 'reembolso' ? (
              <>
                <View style={styles.amberRulesBox}>
                  <Ionicons name="information-circle" size={18} color="#D97706" />
                  <Text style={styles.amberRulesText}>
                    A solicitação realiza a <Text style={{ fontWeight: '800' }}>baixa integral</Text>{' '}
                    do saldo disponível via PIX da{' '}
                    <Text style={{ fontWeight: '800' }}>mesma titularidade (CPF)</Text> e pausa o
                    cartão preventivamente até a conclusão (3 a 5 dias úteis).
                  </Text>
                </View>

                <Text style={styles.modalLabel}>1. CARTEIRA PARA BAIXA INTEGRAL</Text>
                <View style={styles.parentescoChipsRow}>
                  {dependentes.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.parentescoChip,
                        reembolsoAlunoId === c.id && styles.parentescoChipActive,
                      ]}
                      onPress={() => {
                        setReembolsoAlunoId(c.id)
                        setErroFinanceiro('')
                      }}
                    >
                      <Text
                        style={[
                          styles.parentescoChipText,
                          reembolsoAlunoId === c.id && styles.parentescoChipTextActive,
                        ]}
                      >
                        {c.nome.split(' ')[0]} ({formatarMoeda(c.saldo)})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {carteiraReembolso && (
                  <View style={styles.fixedRefundCard}>
                    <View>
                      <Text style={styles.fixedRefundLabel}>VALOR INTEGRAL A REEMBOLSAR</Text>
                      <Text style={styles.fixedRefundValue}>
                        {formatarMoeda(carteiraReembolso.saldo)}
                      </Text>
                    </View>
                    <View style={styles.fixedRefundTag}>
                      <Ionicons name="lock-closed" size={12} color="#475569" />
                      <Text style={styles.fixedRefundTagText}>Valor Integral</Text>
                    </View>
                  </View>
                )}

                <Text style={styles.modalLabel}>2. NOME COMPLETO DO TITULAR (CPF) *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={titularNome}
                  onChangeText={setTitularNome}
                  placeholder="Nome conforme conta bancária"
                />

                <Text style={styles.modalLabel}>CPF DO TITULAR *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={titularCpf}
                  onChangeText={(t) => setTitularCpf(formatarCPF(t))}
                  keyboardType="numeric"
                  placeholder="000.000.000-00"
                />

                <Text style={styles.modalLabel}>TIPO DE CHAVE PIX *</Text>
                <View style={styles.parentescoChipsRow}>
                  {(
                    [
                      { id: 'cpf', label: 'CPF' },
                      { id: 'email', label: 'E-mail' },
                      { id: 'telefone', label: 'Telefone' },
                      { id: 'aleatoria', label: 'Aleatória' },
                    ] as const
                  ).map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.parentescoChip,
                        tipoChavePix === item.id && styles.parentescoChipActive,
                      ]}
                      onPress={() => setTipoChavePix(item.id)}
                    >
                      <Text
                        style={[
                          styles.parentescoChipText,
                          tipoChavePix === item.id && styles.parentescoChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>CHAVE PIX PARA RECEBIMENTO *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={chavePix}
                  onChangeText={setChavePix}
                  placeholder="Digite sua chave PIX"
                />

                <Text style={styles.modalLabel}>3. MOTIVO DA SOLICITAÇÃO</Text>
                <View style={styles.parentescoChipsRow}>
                  {MOTIVOS_REEMBOLSO.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.parentescoChip,
                        motivoSelect === m && styles.parentescoChipActive,
                      ]}
                      onPress={() => setMotivoSelect(m)}
                    >
                      <Text
                        style={[
                          styles.parentescoChipText,
                          motivoSelect === m && styles.parentescoChipTextActive,
                        ]}
                      >
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={styles.modalInput}
                  value={motivoDetalhes}
                  onChangeText={setMotivoDetalhes}
                  placeholder="Observação complementar (opcional)"
                />

                <TouchableOpacity
                  style={styles.lgpdCheckboxRow}
                  onPress={() => setCienteBloqueio(!cienteBloqueio)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={cienteBloqueio ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={cienteBloqueio ? '#1E62D0' : '#94A3B8'}
                  />
                  <Text style={styles.lgpdCheckboxText}>
                    Estou ciente de que o saldo integral de{' '}
                    <Text style={{ fontWeight: '800', color: '#0F172A' }}>
                      {formatarMoeda(carteiraReembolso?.saldo || 0)}
                    </Text>{' '}
                    será reservado e o cartão ficará pausado até a conclusão do estorno.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { backgroundColor: '#F27835' },
                    (solicitandoReembolso ||
                      !carteiraReembolso ||
                      carteiraReembolso.saldo <= 0 ||
                      jaPossuiSolicitacaoPendente) &&
                      styles.saveBtnDisabled,
                  ]}
                  onPress={handleSolicitarReembolsoRPC}
                  disabled={
                    solicitandoReembolso ||
                    !carteiraReembolso ||
                    carteiraReembolso.saldo <= 0 ||
                    jaPossuiSolicitacaoPendente
                  }
                >
                  {solicitandoReembolso ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {jaPossuiSolicitacaoPendente
                        ? 'SOLICITAÇÃO JÁ EM ANÁLISE'
                        : `SOLICITAR BAIXA INTEGRAL (${formatarMoeda(carteiraReembolso?.saldo || 0)})`}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : dependentes.length < 2 ? (
              <View style={styles.alreadyLinkedBanner}>
                <Text style={styles.alreadyLinkedText}>
                  Você precisa ter pelo menos 2 carteiras vinculadas (ex: dois dependentes ou sua
                  Carteira Titular ativa) para transferir saldo entre elas.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalLabel}>DE (CARTEIRA DE ORIGEM)</Text>
                <View style={styles.parentescoChipsRow}>
                  {dependentes.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.parentescoChip,
                        origemTransferId === d.id && styles.parentescoChipActive,
                      ]}
                      onPress={() => {
                        setOrigemTransferId(d.id)
                        if (d.id === destinoTransferId) {
                          const outro = dependentes.find((x) => x.id !== d.id)
                          if (outro) setDestinoTransferId(outro.id)
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.parentescoChipText,
                          origemTransferId === d.id && styles.parentescoChipTextActive,
                        ]}
                      >
                        {d.nome.split(' ')[0]} ({formatarMoeda(d.saldo)})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.modalLabel, { marginTop: 8 }]}>PARA (CARTEIRA DE DESTINO)</Text>
                <View style={styles.parentescoChipsRow}>
                  {dependentes
                    .filter((d) => d.id !== origemTransferId)
                    .map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        style={[
                          styles.parentescoChip,
                          destinoTransferId === d.id && styles.parentescoChipActive,
                        ]}
                        onPress={() => setDestinoTransferId(d.id)}
                      >
                        <Text
                          style={[
                            styles.parentescoChipText,
                            destinoTransferId === d.id && styles.parentescoChipTextActive,
                          ]}
                        >
                          {d.nome.split(' ')[0]} ({formatarMoeda(d.saldo)})
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.transferHeaderRow}>
                  <Text style={styles.modalLabel}>VALOR A TRANSFERIR (R$)</Text>
                  {carteiraOrigem && carteiraOrigem.saldo > 0 && (
                    <TouchableOpacity
                      onPress={() => setValorTransferencia(carteiraOrigem.saldo.toFixed(2))}
                    >
                      <Text style={styles.transferTotalLink}>
                        Usar total ({formatarMoeda(carteiraOrigem.saldo)})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.currencyPrefix}>R$</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0,00"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={valorTransferencia}
                    onChangeText={setValorTransferencia}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { backgroundColor: '#059669' },
                    (transferindo || !carteiraOrigem || carteiraOrigem.saldo <= 0) &&
                      styles.saveBtnDisabled,
                  ]}
                  onPress={handleConfirmarTransferenciaRPC}
                  disabled={transferindo || !carteiraOrigem || carteiraOrigem.saldo <= 0}
                >
                  {transferindo ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>CONFIRMAR TRANSFERÊNCIA IMEDIATA</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Histórico de Solicitações de Reembolso */}
            {solicitacoesReembolso.length > 0 && (
              <View style={styles.refundHistorySection}>
                <Text style={styles.refundHistoryTitle}>
                  Minhas Solicitações de Reembolso ({solicitacoesReembolso.length})
                </Text>

                {solicitacoesReembolso.map((sol) => {
                  const nomeCarteira =
                    dependentes.find((d) => d.id === sol.aluno_id)?.nome || 'Carteira'
                  const pago = sol.status === 'aprovado_pago'
                  const pendente = sol.status === 'pendente'

                  return (
                    <View key={sol.id} style={styles.refundHistoryCard}>
                      <View style={styles.refundHistoryTop}>
                        <Text style={styles.refundHistoryName} numberOfLines={1}>
                          {nomeCarteira}
                        </Text>
                        <Text
                          style={[
                            styles.refundStatusBadge,
                            pago
                              ? { backgroundColor: '#DCFCE7', color: '#15803D' }
                              : pendente
                              ? { backgroundColor: '#FEF3C7', color: '#B45309' }
                              : { backgroundColor: '#FFE4E6', color: '#BE123C' },
                          ]}
                        >
                          {pago ? 'PAGO' : pendente ? 'EM ANÁLISE' : 'RECUSADO'}
                        </Text>
                      </View>

                      <Text style={styles.refundHistoryMeta}>
                        {formatarMoeda(Number(sol.valor_solicitado || 0))} • PIX (
                        {sol.tipo_chave_pix.toUpperCase()}): {sol.chave_pix_destino}
                      </Text>

                      {!!sol.observacao_admin && (
                        <Text style={styles.refundHistoryObs}>
                          Cantina: {sol.observacao_admin}
                        </Text>
                      )}

                      {!!sol.comprovante_url && (
                        <TouchableOpacity
                          style={styles.comprovanteBtn}
                          onPress={() => Linking.openURL(sol.comprovante_url!)}
                        >
                          <Ionicons name="document-text-outline" size={14} color="#FFFFFF" />
                          <Text style={styles.comprovanteBtnText}>VER COMPROVANTE</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL VINCULAR NOVO DEPENDENTE (ADEQUADO À LGPD)                    */}
      {/* =================================================================== */}
      <Modal
        visible={modalVincularVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!vinculandoAluno) setModalVincularVisible(false)
        }}
      >
        <View style={styles.modalOverlayBottom}>
          <ScrollView
            style={styles.modalContentSheetScroll}
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTag}>VÍNCULO FAMILIAR (LGPD)</Text>
                <Text style={styles.modalTitle}>Vincular Novo Dependente</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setModalVincularVisible(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <View style={styles.lgpdInfoBox}>
              <Ionicons name="shield-checkmark" size={18} color="#1E62D0" />
              <Text style={styles.lgpdInfoText}>
                Em conformidade com a <Text style={{ fontWeight: '800' }}>LGPD</Text>, informe o
                nome completo ou a matrícula e a data de nascimento do aluno para confirmar o vínculo.
              </Text>
            </View>

            <Text style={styles.modalLabel}>NOME COMPLETO OU MATRÍCULA *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: 2025076 ou Nome Completo"
              placeholderTextColor="#94A3B8"
              value={identificadorBusca}
              onChangeText={(txt) => {
                setIdentificadorBusca(txt)
                setAlunoValidado(null)
                setErroVincular('')
              }}
            />

            <Text style={styles.modalLabel}>DATA DE NASCIMENTO DO ALUNO *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="DD/MM/AAAA ou AAAA-MM-DD"
              placeholderTextColor="#94A3B8"
              value={dataNascBusca}
              onChangeText={(txt) => {
                setDataNascBusca(txt)
                setAlunoValidado(null)
                setErroVincular('')
              }}
            />

            {!alunoValidado && (
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (buscandoAluno || !identificadorBusca.trim() || !dataNascBusca.trim()) &&
                    styles.saveBtnDisabled,
                ]}
                onPress={handleValidarAlunoParaVinculo}
                disabled={buscandoAluno || !identificadorBusca.trim() || !dataNascBusca.trim()}
              >
                {buscandoAluno ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>LOCALIZAR ALUNO</Text>
                )}
              </TouchableOpacity>
            )}

            {!!erroVincular && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#E11D48" />
                <Text style={styles.errorBoxText}>{erroVincular}</Text>
              </View>
            )}

            {alunoValidado && (
              <View style={styles.validatedAlunoBox}>
                <Text style={styles.validatedBadge}>ALUNO IDENTIFICADO</Text>
                <Text style={styles.validatedName}>{alunoValidado.nomeMascarado}</Text>
                <Text style={styles.validatedMeta}>
                  Matrícula: {alunoValidado.matricula}
                  {alunoValidado.serie || alunoValidado.turma
                    ? ` • ${[alunoValidado.serie, alunoValidado.turma].filter(Boolean).join(' ')}`
                    : ''}
                </Text>

                {alunoValidado.jaVinculado ? (
                  <View style={styles.alreadyLinkedBanner}>
                    <Text style={styles.alreadyLinkedText}>
                      Este aluno já está vinculado à sua conta.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.modalLabel, { marginTop: 12 }]}>GRAU DE PARENTESCO</Text>
                    <View style={styles.parentescoChipsRow}>
                      {(
                        [
                          { id: 'pai', label: 'Pai' },
                          { id: 'mae', label: 'Mãe' },
                          { id: 'responsavel', label: 'Resp. Legal' },
                          { id: 'outro', label: 'Outro' },
                        ] as const
                      ).map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.parentescoChip,
                            parentescoBusca === item.id && styles.parentescoChipActive,
                          ]}
                          onPress={() => setParentescoBusca(item.id)}
                        >
                          <Text
                            style={[
                              styles.parentescoChipText,
                              parentescoBusca === item.id && styles.parentescoChipTextActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={styles.lgpdCheckboxRow}
                      onPress={() => setAceiteLgpd(!aceiteLgpd)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={aceiteLgpd ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={aceiteLgpd ? '#1E62D0' : '#94A3B8'}
                      />
                      <Text style={styles.lgpdCheckboxText}>
                        Confirmo ser responsável legal por este menor (Art. 14 da LGPD).
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.saveBtn,
                        { backgroundColor: '#16A34A' },
                        (vinculandoAluno || !aceiteLgpd) && styles.saveBtnDisabled,
                      ]}
                      onPress={handleConfirmarVinculo}
                      disabled={vinculandoAluno || !aceiteLgpd}
                    >
                      {vinculandoAluno ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.saveBtnText}>CONFIRMAR VÍNCULO FAMILIAR</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL DEFINIR PIN DO TOTEM                                          */}
      {/* =================================================================== */}
      <Modal
        visible={modalPinVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!salvandoPin) setModalPinVisible(false)
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTag}>SEGURANÇA NO TOTEM</Text>
                <Text style={styles.modalTitle}>Senha PIN do Totem</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setModalPinVisible(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Configure uma senha numérica de 4 a 6 dígitos para{' '}
              <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                {alunoSelecionado?.nome}
              </Text>{' '}
              comprar no totem.
            </Text>

            {!!alunoSelecionado?.matricula && (
              <View style={styles.matriculaTotemBox}>
                <Text style={styles.matriculaTotemLabel}>Matrícula no Totem:</Text>
                <Text style={styles.matriculaTotemValue}>{alunoSelecionado.matricula}</Text>
              </View>
            )}

            <Text style={styles.modalLabel}>NOVO PIN (4 A 6 NÚMEROS)</Text>
            <TextInput
              style={styles.pinInput}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              value={novoPin}
              onChangeText={(t) => {
                setNovoPin(t.replace(/\D/g, '').slice(0, 6))
                setErroPin('')
              }}
            />

            <Text style={styles.modalLabel}>CONFIRMAR NOVO PIN</Text>
            <TextInput
              style={styles.pinInput}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              value={confirmarPin}
              onChangeText={(t) => {
                setConfirmarPin(t.replace(/\D/g, '').slice(0, 6))
                setErroPin('')
              }}
            />

            {!!erroPin && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#E11D48" />
                <Text style={styles.errorBoxText}>{erroPin}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (salvandoPin || novoPin.length < 4) && styles.saveBtnDisabled,
              ]}
              onPress={handleSalvarPinTotem}
              disabled={salvandoPin || novoPin.length < 4}
            >
              {salvandoPin ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>SALVAR PIN DO TOTEM</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL AJUSTAR LIMITE DIÁRIO                                         */}
      {/* =================================================================== */}
      <Modal
        visible={modalLimiteVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!salvandoLimite) setModalLimiteVisible(false)
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTag}>CONTROLE PARENTAL</Text>
                <Text style={styles.modalTitle}>Ajustar Limite Diário</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setModalLimiteVisible(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Defina o valor máximo que{' '}
              <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                {alunoSelecionado?.nome}
              </Text>{' '}
              pode gastar por dia na cantina (0 = sem limite).
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

      {/* =================================================================== */}
      {/* MODAL EDITAR DADOS                                                  */}
      {/* =================================================================== */}
      <Modal
        visible={modalEditarVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!salvandoCadastro) setModalEditarVisible(false)
        }}
      >
        <View style={styles.modalOverlayBottom}>
          <View style={styles.modalContentSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTag}>CADASTRO</Text>
                <Text style={styles.modalTitle}>Editar Dados</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setModalEditarVisible(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>NOME COMPLETO</Text>
            <TextInput
              style={styles.modalInput}
              value={editNome}
              onChangeText={setEditNome}
              placeholder="Nome completo"
            />

            {alunoSelecionado?.tipo !== 'responsavel' && (
              <>
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
              </>
            )}

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

      {/* =================================================================== */}
      {/* MODAL RESTRIÇÕES & ALERGIAS                                         */}
      {/* =================================================================== */}
      <Modal
        visible={modalRestricoesVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!salvandoRestricoes) setModalRestricoesVisible(false)
        }}
      >
        <View style={styles.modalOverlayBottom}>
          <ScrollView
            style={styles.modalContentSheetScroll}
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTag}>SAÚDE & NUTRIÇÃO</Text>
                <Text style={styles.modalTitle}>Restrições & Alergias</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseIconBtn}
                onPress={() => setModalRestricoesVisible(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Marque ou descreva o que{' '}
              <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                {alunoSelecionado?.nome}
              </Text>{' '}
              não pode consumir na cantina:
            </Text>

            {restricoes.map((item) => (
              <View key={item.id} style={styles.restricaoRow}>
                <View style={styles.restricaoLeft}>
                  <Ionicons name={item.icone as any} size={20} color="#F27835" />
                  <Text style={styles.restricaoNome}>{item.nome}</Text>
                </View>
                <Switch
                  value={item.ativo}
                  onValueChange={() => toggleRestricao(item.id)}
                  trackColor={{ false: '#CBD5E1', true: '#FFEDD5' }}
                  thumbColor={item.ativo ? '#F27835' : '#F8FAFC'}
                />
              </View>
            ))}

            <Text style={[styles.modalLabel, { marginTop: 8 }]}>
              OBSERVAÇÃO / ALERGIA ESPECÍFICA
            </Text>
            <TextInput
              style={styles.modalInput}
              value={alergiaTextoLivre}
              onChangeText={setAlergiaTextoLivre}
              placeholder="Ex: Alergia a corante vermelho, ovo..."
            />

            <TouchableOpacity
              style={[styles.saveBtn, salvandoRestricoes && styles.saveBtnDisabled]}
              onPress={handleSalvarRestricoes}
              disabled={salvandoRestricoes}
            >
              {salvandoRestricoes ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>SALVAR RESTRIÇÕES</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
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
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F27835',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
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
  globalActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  primaryGlobalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E62D0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  emeraldGlobalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  secondaryGlobalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  primaryGlobalBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bodySheet: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 20,
    marginBottom: 18,
  },
  depTabCard: {
    width: 175,
    maxWidth: 175,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  depTabCardSelected: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  depTabCardTitularSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  depTabContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  tabAvatarBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabAvatarBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E62D0',
  },
  tabAvatarTextSelected: {
    color: '#FFFFFF',
  },
  tabName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
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
    color: '#DBEAFE',
  },
  quickLimitBadgeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    marginLeft: 4,
  },
  quickLimitBadgeBtnSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  mainProfileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigAvatarInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E62D0',
  },
  profileName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  tagText: {
    fontSize: 11,
    color: '#64748B',
  },
  tagHighlight: {
    fontSize: 11,
    color: '#1E62D0',
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
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
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
    backgroundColor: '#1E2B58',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  saldoCompactLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#BFDBFE',
    letterSpacing: 0.8,
  },
  saldoCompactValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  rechargeBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F27835',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    gap: 5,
  },
  rechargeBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  blockCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  lockCardBtn: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  unblockCardBtn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  blockCardBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  activeRestricoesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  activeRestricoesText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#C2410C',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 16,
  },
  limitMetricIntegratedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
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
    color: '#1E293B',
  },
  editLimitLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E62D0',
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
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 10,
  },
  receiptCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
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
    fontSize: 12,
    color: '#334155',
  },
  receiptItemQty: {
    fontWeight: '800',
    color: '#1E62D0',
  },
  receiptItemPrice: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyComprasText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    marginVertical: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 28,
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
    marginBottom: 16,
  },
  emptyButtonsColumn: {
    width: '100%',
    gap: 10,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E62D0',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
  },
  emptyPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
  },
  emptySecondaryBtnText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  restricaoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
  },
  modalContentSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 32,
  },
  modalContentSheetScroll: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F27835',
    letterSpacing: 0.7,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalCloseIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
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
    color: '#1E293B',
    marginBottom: 12,
  },
  finTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  finTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  finTabBtnActive: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  finTabBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  finTabBtnTextActive: {
    color: '#FFFFFF',
  },
  amberRulesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  amberRulesText: {
    flex: 1,
    fontSize: 11,
    color: '#78350F',
    lineHeight: 16,
  },
  fixedRefundCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  fixedRefundLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  fixedRefundValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E62D0',
    marginTop: 2,
  },
  fixedRefundTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  fixedRefundTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  transferHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  transferTotalLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E62D0',
    marginBottom: 6,
  },
  refundHistorySection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  refundHistoryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 10,
  },
  refundHistoryCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  refundHistoryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  refundHistoryName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    paddingRight: 8,
  },
  refundStatusBadge: {
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  refundHistoryMeta: {
    fontSize: 11,
    color: '#475569',
  },
  refundHistoryObs: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
  },
  comprovanteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  comprovanteBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  pinInput: {
    height: 50,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 20,
    fontWeight: '900',
    color: '#1E293B',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 12,
  },
  matriculaTotemBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  matriculaTotemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  matriculaTotemValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E62D0',
  },
  lgpdInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  lgpdInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  errorBoxText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#BE123C',
  },
  validatedAlunoBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#1E62D0',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  validatedBadge: {
    fontSize: 9,
    fontWeight: '900',
    color: '#1E62D0',
    letterSpacing: 0.7,
  },
  validatedName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  validatedMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  alreadyLinkedBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  alreadyLinkedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  parentescoChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  parentescoChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  parentescoChipActive: {
    backgroundColor: '#1E62D0',
    borderColor: '#1E62D0',
  },
  parentescoChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  parentescoChipTextActive: {
    color: '#FFFFFF',
  },
  lgpdCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginVertical: 8,
  },
  lgpdCheckboxText: {
    flex: 1,
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
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
    marginBottom: 14,
  },
  currencyPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  saveBtn: {
    height: 50,
    backgroundColor: '#1E62D0',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
})