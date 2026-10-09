import { AppLoadContext } from 'react-router'
import { buildFrontendConfig, get } from '~/utils/frontendConfig'

export type BackendConfig = ReturnType<typeof buildConfig>

export function contextToBackendConfig(context: AppLoadContext): BackendConfig {
	return buildConfig(contextToEnvironment(context))
}

export function contextToEnvironment(context: AppLoadContext): object {
	const env = context.runtime?.env ?? context.cloudflare?.env
	if (!env) throw new Error('Missing runtime environment')
	return env
}

// Only SESSION_SECRET is required; everything else no-ops when unset.
function buildConfig(varStore: object) {
	return {
		sessionSecret: getOrThrow('SESSION_SECRET', varStore),
		cookieSecure: get('COOKIE_SECURE', varStore),
		sesRegion: get('SES_AWS_REGION', varStore) ?? 'us-west-2',
		sesAccessKeyId: get('SES_AWS_ACCESS_KEY_ID', varStore),
		sesSecretAccessKey: get('SES_AWS_SECRET_ACCESS_KEY', varStore),
		sentryDsn: get('SENTRY_DSN', varStore),
		gaSecret: get('GOOGLE_ANALYTICS_API_SECRET', varStore),
		emailFrom: get('EMAIL_FROM', varStore),
		adminEmail: get('ADMIN_EMAIL', varStore),
		dashboardUrl: get('DASHBOARD_URL', varStore) ?? 'http://localhost:5173',
		...buildFrontendConfig(varStore),
	}
}

function getOrThrow(key: string, varStore: object): string {
	const value = get(key, varStore)
	if (!value) throw new Error(`${key} is not defined`)
	return value
}
