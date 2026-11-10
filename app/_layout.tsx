import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '../src/lib/supabase'
import { Session } from '@supabase/supabase-js'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    // 1. Obtém sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsLoading(false)
    })

    // 2. Escuta mudanças na autenticação do Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setIsLoading(false)
      }
    )

    // 3. Trata retorno do segundo plano via deep link (fournschool://)
    const handleDeepLink = (event: { url: string }) => {
      const parsed = Linking.parse(event.url)
      
      // Se a URL do esquema estiver vazia ou raiz (ex: fournschool:///), força o roteamento correto
      if (!parsed.path || parsed.path === '' || parsed.path === '/') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            router.replace('/(tabs)' as any)
          } else {
            router.replace('/' as any)
          }
        })
      }
    }

    const linkSubscription = Linking.addEventListener('url', handleDeepLink)

    return () => {
      subscription.unsubscribe()
      linkSubscription.remove()
    }
  }, [router])

  useEffect(() => {
    if (isLoading) return

    const inTabsGroup = segments[0] === '(tabs)'

    if (!session && inTabsGroup) {
      router.replace('/')
    } else if (session && !inTabsGroup) {
      router.replace('/(tabs)')
    }
  }, [session, segments, isLoading, router])

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2B6CB0" />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
  },
})