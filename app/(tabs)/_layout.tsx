import React, { useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'

export default function TabLayout() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/(auth)' as any)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2B6CB0',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
          height: 60 + (insets.bottom > 0 ? insets.bottom : 8),
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={24} color={(color as string) || '#64748B'} />
          ),
        }}
      />
      <Tabs.Screen
        name="dependentes"
        options={{
          title: 'Alunos',
          tabBarIcon: ({ color }) => (
            <Ionicons name="people" size={24} color={(color as string) || '#64748B'} />
          ),
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color }) => (
            <Ionicons name="receipt" size={24} color={(color as string) || '#64748B'} />
          ),
        }}
      />
      <Tabs.Screen
        name="recarregar"
        options={{
          title: 'Saldo',
          tabBarIcon: ({ color }) => (
            <Ionicons name="wallet" size={24} color={(color as string) || '#64748B'} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={24} color={(color as string) || '#64748B'} />
          ),
        }}
      />
      {/* Rotas ocultas da barra de abas principal */}
      <Tabs.Screen
        name="combo"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="cartoes"
        options={{
          href: null,
        }}
      />
    </Tabs>
  )
}