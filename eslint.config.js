import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    globalIgnores(['dist/', 'node_modules/', 'src/gadgets/libPolyfill']),

    js.configs.recommended,
    {
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single'],
            semi: 'error',
            'prefer-const': 'error',
            'array-callback-return': 'warn',
            'no-constructor-return': 'warn',
            'no-inner-declarations': ['error', 'functions'],
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unreachable-loop': 'error',
            'no-use-before-define': 'error',
            'arrow-body-style': ['error', 'as-needed'],
            'block-scoped-var': 'error',
            curly: 'error',
            eqeqeq: 'error',
            'func-style': 'error',
            'no-empty': 'error',
            'no-empty-function': 'error',
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        linterOptions: {
            reportUnusedInlineConfigs: 'error',
            reportUnusedDisableDirectives: 'error',
        },
    },

    {
        files: ['src/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
                $: 'readonly',
                mw: 'readonly',
                OO: 'readonly',
                wgULS: 'readonly',
                oouiDialog: 'readonly',
                libCachedCode: 'readonly',
                importArticles: 'readonly',
                importScript: 'readonly',
            },
        },
    },

    ...tseslint.configs.recommended,
    {
        files: ['scripts/**/*.ts'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: true,
            },
        },
        rules: {
            '@typescript-eslint/array-type': ['error', { default: 'generic' }],
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/ban-ts-comment': 'error',
            '@typescript-eslint/consistent-generic-constructors': ['error', 'type-annotation'],
            '@typescript-eslint/consistent-indexed-object-style': 'error',
            '@typescript-eslint/consistent-type-assertions': 'error',
            '@typescript-eslint/consistent-type-definitions': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            'default-param-last': 'off',
            '@typescript-eslint/default-param-last': 'error',
        },
    },
]);
