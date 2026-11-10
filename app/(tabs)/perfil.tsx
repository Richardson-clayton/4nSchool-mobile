import React, { useEffect, useState } from 'react'
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
} from 'react-native'
import { supabase } from '../../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

export default function PerfilResponsavelScreen() {
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Dados do Responsável
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [endereco, setEndereco] = useState('')

  // Alteração de Senha
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  const fetchPerfil = async () => {
    try {
      setLoading(true)
      const { data: { user }, error: userErr } = await supabase.auth.getUser()

      if (userErr || !user) return

      // Preenchimento 100% via Supabase Auth Metadata (Sem chamadas à tabela responsaveis)
      setEmail(user.email || '')
      setNome(user.user_metadata?.full_name || user.user_metadata?.nome || '')
      setTelefone(user.user_metadata?.telefone || user.phone || '')
      setCpf(user.user_metadata?.cpf || '')
      setEndereco(user.user_metadata?.endereco || '')
    } catch (e) {
      console.log('Erro ao carregar perfil:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPerfil()
  }, [])

  const handleSalvarDados = async () => {
    if (!nome.trim()) {
      const msg = 'Por favor, preencha o nome completo.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Atenção', msg)
      return
    }

    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 1. Salvar Metadados no Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          full_name: nome.trim(),
          telefone: telefone.trim(),
          cpf: cpf.trim(),
          endereco: endereco.trim(),
        },
      })

      if (authErr) throw authErr

      // 2. Atualizar Senha (se preenchida)
      if (novaSenha.trim()) {
        if (novaSenha !== confirmarSenha) {
          const msg = 'A nova senha e a confirmação não conferem.'
          if (Platform.OS === 'web') alert(msg)
          else Alert.alert('Erro', msg)
          setSalvando(false)
          return
        }

        const { error: passErr } = await supabase.auth.updateUser({
          password: novaSenha,
        })

        if (passErr) throw passErr
        setNovaSenha('')
        setConfirmarSenha('')
      }

      const msgSucesso = 'Dados cadastrais atualizados com sucesso!'
      if (Platform.OS === 'web') alert(msgSucesso)
      else Alert.alert('Sucesso', msgSucesso)
    } catch (err: any) {
      const msgErro = err.message || 'Erro ao atualizar os dados.'
      if (Platform.OS === 'web') alert(msgErro)
      else Alert.alert('Erro', msgErro)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Dados Cadastrais</Text>
        <Text style={styles.subtitle}>Gerencie suas informações pessoais e de contato</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2B6CB0" style={{ marginVertical: 40 }} />
      ) : (
        <View style={styles.mainCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarInitial}>
                {nome ? nome.charAt(0).toUpperCase() : 'C'}
              </Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.avatarName}>{nome || 'Clayton'}</Text>
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
              onChangeText={setCpf}
              placeholder="000.000.000-00"
              keyboardType="numeric"
            />
          </View>

          <Text style={styles.label}>TELEFONE / WHATSAPP</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="call-outline" size={18} color="#64748B" />
            <TextInput
              style={styles.input}
              value={telefone}
              onChangeText={setTelefone}
              placeholder="(85) 90000-0000"
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
              secureTextEntry
            />
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
                  secureTextEntry
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.saveButton, salvando && styles.saveButtonDisabled]}
            onPress={handleSalvarDados}
            disabled={salvando}
            activeOpacity={0.88}
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
    marginBottom: 20,
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
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 40,
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
    backgroundColor: '#2B6CB0',
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
    color: '#0F172A',
  },
  avatarRole: {
    fontSize: 12,
    color: '#2563EB',
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
    color: '#0F172A',
  },
  saveButton: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#2B6CB0',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  saveButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
})