import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

function formatarCPF(valor: string) {
  const digits = valor.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatarTelefone(valor: string) {
  const digits = valor.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export default function PerfilResponsavelScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [saindo, setSaindo] = useState(false)

  // Dados do Responsável
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [endereco, setEndereco] = useState('')

  // Alteração de Senha
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const mostrarAviso = (titulo: string, mensagem: string) => {
    if (Platform.OS === 'web') {
      alert(`${titulo}: ${mensagem}`)
    } else {
      Alert.alert(titulo, mensagem)
    }
  }

  const fetchPerfil = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()

      if (userErr || !user) return

      setEmail(user.email || '')

      const { data: perfilDB } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      const nomeInicial =
        perfilDB?.nome ||
        user.user_metadata?.full_name ||
        user.user_metadata?.nome ||
        ''
      const telInicial =
        perfilDB?.telefone ||
        user.user_metadata?.telefone ||
        user.phone ||
        ''
      const cpfInicial = perfilDB?.cpf || user.user_metadata?.cpf || ''
      const endInicial = perfilDB?.endereco || user.user_metadata?.endereco || ''

      setNome(nomeInicial)
      setTelefone(formatarTelefone(telInicial))
      setCpf(formatarCPF(cpfInicial))
      setEndereco(endInicial)
    } catch (e) {
      console.log('Erro ao carregar perfil:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPerfil()
  }, [fetchPerfil])

  const handleSalvarDados = async () => {
    if (!nome.trim()) {
      mostrarAviso('Atenção', 'Por favor, preencha o nome completo.')
      return
    }

    if (novaSenha.trim()) {
      if (novaSenha.trim().length < 6) {
        mostrarAviso('Atenção', 'A nova senha deve ter pelo menos 6 caracteres.')
        return
      }
      if (novaSenha !== confirmarSenha) {
        mostrarAviso('Erro', 'A nova senha e a confirmação não conferem.')
        return
      }
    }

    setSalvando(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const nomeLimpo = nome.trim()
      const telLimpo = telefone.trim()
      const cpfLimpo = cpf.trim()
      const endLimpo = endereco.trim()

      // 1. Atualizar Metadados no Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          full_name: nomeLimpo,
          telefone: telLimpo,
          cpf: cpfLimpo,
          endereco: endLimpo,
        },
      })

      if (authErr) throw authErr

      // 2. Sincronizar com a tabela 'perfis' usada pelo portal web
      try {
        await supabase
          .from('perfis')
          .update({
            nome: nomeLimpo,
            telefone: telLimpo,
            cpf: cpfLimpo,
            endereco: endLimpo,
          })
          .eq('id', user.id)
      } catch (ePerfil) {
        console.log('Atualização auxiliar em perfis:', ePerfil)
      }

      // 3. Atualizar Senha (se preenchida)
      if (novaSenha.trim()) {
        const { error: passErr } = await supabase.auth.updateUser({
          password: novaSenha.trim(),
        })

        if (passErr) throw passErr
        setNovaSenha('')
        setConfirmarSenha('')
      }

      mostrarAviso('Sucesso', 'Dados cadastrais atualizados com sucesso!')
    } catch (err: any) {
      mostrarAviso('Erro', err.message || 'Erro ao atualizar os dados.')
    } finally {
      setSalvando(false)
    }
  }

  const handleLogout = async () => {
    setSaindo(true)
    try {
      await supabase.auth.signOut({ scope: 'local' })
      router.replace('/' as any)
    } catch (err: any) {
      setSaindo(false)
      mostrarAviso('Erro', err.message || 'Não foi possível encerrar a sessão.')
    }
  }

  const nomeExibicao = nome.trim() || (email ? email.split('@')[0] : 'Responsável')
  const inicialExibicao = nomeExibicao.charAt(0).toUpperCase()

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
          <Text style={styles.headerBadgeText}>MINHA CONTA</Text>
        </View>
        <Text style={styles.title}>Dados Cadastrais</Text>
        <Text style={styles.subtitle}>
          Gerencie suas informações pessoais, contato e senha de acesso
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.bodySheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 22,
            paddingBottom: Math.max(insets.bottom, 24) + 20,
          }}
        >
          {loading ? (
            <ActivityIndicator size="large" color="#1E62D0" style={{ marginVertical: 48 }} />
          ) : (
            <View style={styles.mainCard}>
              <View style={styles.avatarRow}>
                <View style={styles.avatarBadge}>
                  <Text style={styles.avatarInitial}>{inicialExibicao}</Text>
                </View>
                <View style={styles.avatarInfo}>
                  <Text style={styles.avatarName} numberOfLines={1}>
                    {nomeExibicao}
                  </Text>
                  <Text style={styles.avatarRole}>Responsável Financeiro</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>INFORMAÇÕES PESSOAIS</Text>

              <Text style={styles.label}>NOME COMPLETO</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.input}
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Seu nome completo"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <Text style={styles.label}>E-MAIL DE ACESSO</Text>
              <View style={[styles.inputWrapper, styles.inputDisabled]}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" />
                <TextInput
                  style={[styles.input, { color: '#94A3B8' }]}
                  value={email}
                  editable={false}
                />
              </View>

              <Text style={styles.label}>CPF</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="card-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.input}
                  value={cpf}
                  onChangeText={(txt) => setCpf(formatarCPF(txt))}
                  placeholder="000.000.000-00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>

              <Text style={styles.label}>TELEFONE / WHATSAPP</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.input}
                  value={telefone}
                  onChangeText={(txt) => setTelefone(formatarTelefone(txt))}
                  placeholder="(85) 90000-0000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.label}>ENDEREÇO RESIDENCIAL</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="location-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.input}
                  value={endereco}
                  onChangeText={setEndereco}
                  placeholder="Rua, número, bairro e cidade"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>SEGURANÇA & SENHA</Text>

              <Text style={styles.label}>NOVA SENHA (OPCIONAL)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#64748B" />
                <TextInput
                  style={styles.input}
                  value={novaSenha}
                  onChangeText={setNovaSenha}
                  placeholder="Mínimo de 6 caracteres"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!mostrarSenha}
                />
                <TouchableOpacity onPress={() => setMostrarSenha(!mostrarSenha)}>
                  <Ionicons
                    name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              {novaSenha.length > 0 && (
                <>
                  <Text style={styles.label}>CONFIRMAR NOVA SENHA</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#64748B" />
                    <TextInput
                      style={styles.input}
                      value={confirmarSenha}
                      onChangeText={setConfirmarSenha}
                      placeholder="Digite novamente a nova senha"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!mostrarSenha}
                    />
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.saveButton, salvando && styles.saveButtonDisabled]}
                onPress={handleSalvarDados}
                disabled={salvando}
                activeOpacity={0.85}
              >
                {salvando ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>SALVAR ALTERAÇÕES</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logoutFooterBtn}
                onPress={handleLogout}
                disabled={saindo}
                activeOpacity={0.85}
              >
                {saindo ? (
                  <ActivityIndicator color="#E11D48" size="small" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={18} color="#E11D48" />
                    <Text style={styles.logoutFooterText}>ENCERRAR SESSÃO</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  bodySheet: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1E62D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  avatarInfo: {
    flex: 1,
  },
  avatarName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  avatarRole: {
    fontSize: 12,
    color: '#1E62D0',
    fontWeight: '700',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 14,
    letterSpacing: 0.6,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
    letterSpacing: 0.5,
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
    gap: 10,
    marginBottom: 14,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  saveButton: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#1E62D0',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    elevation: 2,
    shadowColor: '#1E62D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#94A3B8',
    elevation: 0,
    shadowOpacity: 0,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  logoutFooterBtn: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  logoutFooterText: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
})