import pluginReactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'node_modules/', '.vite/'] },
  {
    extends: [
      ...tseslint.configs.recommended
    ],
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': pluginReactHooks
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
)
