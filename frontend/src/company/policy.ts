export type OnboardingUser = { role: string; emailVerified?: boolean; passwordChangeRequired?: boolean }

export function needsOnboarding(user: OnboardingUser): boolean {
  return (user.role === 'MANAGER' || user.role === 'PROCTOR') &&
    (user.emailVerified !== true || user.passwordChangeRequired !== false)
}

export function canDelegate(member: { role: string; status: string; emailVerified: boolean; passwordChangeRequired: boolean }): boolean {
  return member.role === 'PROCTOR' && member.status === 'ACTIVE' && member.emailVerified === true && member.passwordChangeRequired === false
}

export function mustLogoutForOnboarding(user: OnboardingUser | null, pathname: string, previousPathname: string): boolean {
  if (!user || !needsOnboarding(user) || pathname === '/onboarding') return false
  return pathname !== '/login' || previousPathname === '/onboarding'
}
