/**
 * Apollo Client Configuration for Mobile App
 * 
 * Provides GraphQL client setup with:
 * - Authentication headers (JWT token)
 * - Error handling
 * - Retry logic
 * - Cache configuration
 */

import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client'
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors'
import { SetContextLink } from '@apollo/client/link/context'
import { ErrorLink } from '@apollo/client/link/error'
import { getUserToken } from '../utils/secureStorage'
import { isUnauthenticatedGraphQLError } from '../utils/authErrors'
import { handleAuthRejection } from '../utils/sessionExpiry'
import { CachePersistor } from 'apollo3-cache-persist'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { logger, logApiRequest, logApiResponse, logApiError } from '../utils/debugLogger'

// API URL configuration for the GraphQL endpoint.
// In __DEV__ mode, this is currently pointed to the live server 'https://task.amtariksha.com/api/graphql'
// to bypass local API connection or environment setup issues during testing.
// To test against a local development server running on port 3000, revert this to:
// 'http://localhost:3000/api/graphql' and ensure ADB port forwarding is configured
// via: adb reverse tcp:3000 tcp:3000
const API_URL = __DEV__
  ? 'https://task.amtariksha.com/api/graphql' // Pointing to live server for testing stability
  : 'https://task.amtariksha.com/api/graphql' // Production server URL

/**
 * HTTP Link - connects to GraphQL endpoint
 */
const httpLink = createHttpLink({
  uri: API_URL,
})

/**
 * Auth Link - adds JWT token to request headers
 */
const authLink = new SetContextLink(async (prevContext) => {
  const token = await getUserToken()
  return {
    headers: {
      ...prevContext.headers,
      authorization: token ? `Bearer ${token}` : '',
    },
    // Read back by errorLink: a refusal only ends the session if it refused the stored token.
    authToken: token,
  }
})

/**
 * Error Link - logs every GraphQL and network error to the console and the
 * in-app debug logger, and ends the session when the server refuses the token.
 *
 * Apollo 4 passes a single `error`. This used to destructure Apollo 3's
 * `graphQLErrors` / `networkError` through an `as any`, which were always
 * undefined, so from the 4.0 upgrade nothing here logged or signed anyone out.
 */
const errorLink = new ErrorLink(({ error, operation }) => {
  const { operationName } = operation
  const { authToken } = operation.getContext()
  const sentToken = typeof authToken === 'string' ? authToken : null
  const source = operationName || 'Unnamed GraphQL operation'

  if (CombinedGraphQLErrors.is(error)) {
    error.errors.forEach(({ message, locations, path }) => {
      logger.error(
        'GraphQL',
        `[GraphQL error]: Message: ${message}, Location: ${JSON.stringify(locations)}, Path: ${path}`,
        { operation: operationName }
      )
    })
    // Auth failures arrive as GraphQL errors with HTTP 200, not as a 401.
    if (error.errors.some(isUnauthenticatedGraphQLError)) {
      void handleAuthRejection(sentToken, source)
    }
    return
  }

  const statusCode = ServerError.is(error) ? error.statusCode : undefined
  logger.error('Network', `[Network error]: ${error.message}`, { operation: operationName, statusCode })
  if (statusCode === 401) {
    void handleAuthRejection(sentToken, source)
  }
})

/**
 * In-Memory Cache with persistence
 */
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        // Cache configuration for specific queries
        tasks: {
          merge(existing = [], incoming) {
            return incoming
          },
        },
        bugs: {
          merge(existing = [], incoming) {
            return incoming
          },
        },
        feedPosts: {
          merge(existing = [], incoming) {
            return incoming
          },
        },
      },
    },
  },
})

/**
 * Cache Persistor - saves cache to AsyncStorage for offline support
 */
export const persistor = new CachePersistor({
  cache,
  storage: AsyncStorage as any,
  maxSize: 1048576 * 10, // 10 MB
  debug: __DEV__,
})

/**
 * Initialize cache persistence
 * Call this before rendering the app
 */
export async function initializeApollo() {
  try {
    logger.info('Apollo', 'Initializing Apollo Client', { apiUrl: API_URL })
    await persistor.restore()
    console.log('Apollo cache restored from storage')
    logger.info('Apollo', 'Cache restored from storage')
  } catch (error) {
    console.error('Failed to restore Apollo cache:', error)
    logger.error('Apollo', 'Failed to restore cache', error)
  }
}

/**
 * Apollo Client Instance
 */
export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'cache-first', // Changed to cache-first for offline support
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
})

/**
 * Helper function to execute GraphQL queries
 */
export async function executeQuery<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    const result = await apolloClient.query({
      query: require('@apollo/client').gql(query),
      variables,
    })
    
    return result.data as T
  } catch (error) {
    console.error('GraphQL query error:', error)
    throw error
  }
}

/**
 * Helper function to execute GraphQL mutations
 */
export async function executeMutation<T = any>(
  mutation: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    const result = await apolloClient.mutate({
      mutation: require('@apollo/client').gql(mutation),
      variables,
    })
    
    return result.data as T
  } catch (error) {
    console.error('GraphQL mutation error:', error)
    throw error
  }
}

