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
    let isMounted = true

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (!isMounted) return
        setSession(initialSession)
        setIsLoading(false)
      })
      .catch(() => {
        if (isMounted) setIsLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return
      setSession(currentSession)
      setIsLoading(false)
    })

    const handleDeepLink = (event: { url: string }) => {
      const parsed = Linking.parse(event.url)
      if (!parsed.path || parsed.path === '' || parsed.path === '/') {
        supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
          router.replace((activeSession ? '/(tabs)' : '/') as any)
        })
      }
    }

    const linkSubscription = Linking.addEventListener('url', handleDeepLink)

    return () => {
      isMounted = false
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
        <ActivityIndicator size="large" color="#1E2B58" />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="cadastro" options={{ headerShown: false }} />
      <Stack.Screen name="esqueci-senha" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E2B58',
  },
})