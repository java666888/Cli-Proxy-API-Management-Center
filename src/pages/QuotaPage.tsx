/**
 * Quota management page - coordinates the three quota sections.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useQuotaStore } from '@/stores';
import { authFilesApi, configFileApi } from '@/services/api';
import {
  QuotaSection,
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG
} from '@/components/quota';
import type { AuthFileItem, CodexQuotaState } from '@/types';
import styles from './QuotaPage.module.scss';

const MOCK_CODEX_QUOTA_STORAGE_KEY = 'quota-page:mock-codex-quota';
const CAN_USE_MOCK_CODEX_QUOTA = import.meta.env.DEV;

const MOCK_CODEX_FILES: AuthFileItem[] = [
  { name: 'codex-pro-20x-a.json', type: 'codex', authIndex: 'mock-codex-1' },
  { name: 'codex-pro-5x-b.json', type: 'codex', authIndex: 'mock-codex-2' },
  { name: 'codex-team-c.json', type: 'codex', authIndex: 'mock-codex-3' },
  { name: 'codex-plus-d.json', type: 'codex', authIndex: 'mock-codex-4' },
  { name: 'codex-missing-weekly.json', type: 'codex', authIndex: 'mock-codex-5' },
  { name: 'codex-error.json', type: 'codex', authIndex: 'mock-codex-6' },
  { name: 'codex-idle.json', type: 'codex', authIndex: 'mock-codex-7' }
];

const MOCK_CODEX_FILE_NAMES = new Set(MOCK_CODEX_FILES.map((file) => file.name));

const createMockCodexFiles = (): AuthFileItem[] => MOCK_CODEX_FILES.map((file) => ({ ...file }));

const createMockCodexQuota = (): Record<string, CodexQuotaState> => ({
  'codex-pro-20x-a.json': {
    status: 'success',
    planType: 'pro',
    windows: [
      { id: 'five-hour', label: '5-hour', usedPercent: 22, resetLabel: 'resets in 1h 12m' },
      { id: 'weekly', label: 'Weekly', usedPercent: 18, resetLabel: 'resets in 3d 4h' },
      {
        id: 'code-review-five-hour',
        label: 'Code review 5-hour',
        usedPercent: 40,
        resetLabel: 'resets in 53m'
      },
      {
        id: 'code-review-weekly',
        label: 'Code review weekly',
        usedPercent: 35,
        resetLabel: 'resets in 3d 4h'
      }
    ]
  },
  'codex-pro-5x-b.json': {
    status: 'success',
    planType: 'prolite',
    windows: [
      { id: 'five-hour', label: '5-hour', usedPercent: 41, resetLabel: 'resets in 2h 06m' },
      { id: 'weekly', label: 'Weekly', usedPercent: 54, resetLabel: 'resets in 5d 2h' },
      {
        id: 'code-review-five-hour',
        label: 'Code review 5-hour',
        usedPercent: 70,
        resetLabel: 'resets in 1h 33m'
      },
      {
        id: 'code-review-weekly',
        label: 'Code review weekly',
        usedPercent: 62,
        resetLabel: 'resets in 5d 2h'
      }
    ]
  },
  'codex-team-c.json': {
    status: 'success',
    planType: 'team',
    windows: [
      { id: 'five-hour', label: '5-hour', usedPercent: 9, resetLabel: 'resets in 48m' },
      { id: 'weekly', label: 'Weekly', usedPercent: 12, resetLabel: 'resets in 1d 11h' },
      {
        id: 'code-review-five-hour',
        label: 'Code review 5-hour',
        usedPercent: 28,
        resetLabel: 'resets in 48m'
      },
      {
        id: 'code-review-weekly',
        label: 'Code review weekly',
        usedPercent: 25,
        resetLabel: 'resets in 1d 11h'
      }
    ]
  },
  'codex-plus-d.json': {
    status: 'success',
    planType: 'plus',
    windows: [
      { id: 'five-hour', label: '5-hour', usedPercent: 83, resetLabel: 'resets in 3h 40m' },
      { id: 'weekly', label: 'Weekly', usedPercent: 91, resetLabel: 'resets in 6d 10h' },
      {
        id: 'code-review-five-hour',
        label: 'Code review 5-hour',
        usedPercent: 80,
        resetLabel: 'resets in 3h 40m'
      },
      {
        id: 'code-review-weekly',
        label: 'Code review weekly',
        usedPercent: 88,
        resetLabel: 'resets in 6d 10h'
      }
    ]
  },
  'codex-missing-weekly.json': {
    status: 'success',
    planType: 'plus',
    windows: [
      { id: 'five-hour', label: '5-hour', usedPercent: 16, resetLabel: 'resets in 2h 22m' },
      {
        id: 'code-review-five-hour',
        label: 'Code review 5-hour',
        usedPercent: 31,
        resetLabel: 'resets in 2h 22m'
      }
    ]
  },
  'codex-error.json': {
    status: 'error',
    windows: [],
    error: 'Mocked quota request failed',
    errorStatus: 429
  }
});

const readInitialMockCodexQuotaMode = (): boolean => {
  if (!CAN_USE_MOCK_CODEX_QUOTA) return false;
  if (typeof window === 'undefined') return false;

  const hashQuery = window.location.hash.split('?')[1] ?? '';
  const hashParams = new URLSearchParams(hashQuery);
  const hashValue = hashParams.get('mockCodexQuota');
  if (hashValue === '1' || hashValue === 'true') return true;

  const stored = window.localStorage.getItem(MOCK_CODEX_QUOTA_STORAGE_KEY);
  return stored === '1';
};

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const setCodexQuota = useQuotaStore((state) => state.setCodexQuota);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMockCodexQuotaMode, setIsMockCodexQuotaMode] = useState<boolean>(
    readInitialMockCodexQuotaMode
  );

  const disableControls = isMockCodexQuotaMode || connectionStatus !== 'connected';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!CAN_USE_MOCK_CODEX_QUOTA) {
      window.localStorage.removeItem(MOCK_CODEX_QUOTA_STORAGE_KEY);
      return;
    }

    if (isMockCodexQuotaMode) {
      window.localStorage.setItem(MOCK_CODEX_QUOTA_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(MOCK_CODEX_QUOTA_STORAGE_KEY);
    }
  }, [isMockCodexQuotaMode]);

  const loadConfig = useCallback(async () => {
    if (isMockCodexQuotaMode) return;
    try {
      await configFileApi.fetchConfigYaml();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError((prev) => prev || errorMessage);
    }
  }, [isMockCodexQuotaMode, t]);

  const loadFiles = useCallback(async () => {
    if (isMockCodexQuotaMode) {
      setLoading(false);
      setError('');
      setFiles(createMockCodexFiles());
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isMockCodexQuotaMode, t]);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadConfig(), loadFiles()]);
  }, [loadConfig, loadFiles]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    loadFiles();
    loadConfig();
  }, [loadFiles, loadConfig]);

  useEffect(() => {
    if (!isMockCodexQuotaMode) return;

    setCodexQuota((prev) => ({
      ...prev,
      ...createMockCodexQuota()
    }));
  }, [isMockCodexQuotaMode, setCodexQuota]);

  useEffect(() => {
    if (isMockCodexQuotaMode) return;

    setCodexQuota((prev) => {
      let changed = false;
      const nextState = { ...prev };

      Object.keys(nextState).forEach((fileName) => {
        if (!MOCK_CODEX_FILE_NAMES.has(fileName)) return;
        delete nextState[fileName];
        changed = true;
      });

      return changed ? nextState : prev;
    });
  }, [isMockCodexQuotaMode, setCodexQuota]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderTop}>
          <h1 className={styles.pageTitle}>{t('quota_management.title')}</h1>
          {CAN_USE_MOCK_CODEX_QUOTA && (
            <div className={styles.headerActions}>
              <Button
                variant={isMockCodexQuotaMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setIsMockCodexQuotaMode((prev) => !prev)}
              >
                {isMockCodexQuotaMode
                  ? t('quota_management.mock_codex_quota_on')
                  : t('quota_management.mock_codex_quota_off')}
              </Button>
            </div>
          )}
        </div>
        <p className={styles.description}>{t('quota_management.description')}</p>
        {CAN_USE_MOCK_CODEX_QUOTA && isMockCodexQuotaMode && (
          <div className={styles.mockModeBanner}>
            {t('quota_management.mock_codex_quota_hint')}
          </div>
        )}
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <QuotaSection
        config={CLAUDE_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={ANTIGRAVITY_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={CODEX_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={GEMINI_CLI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={KIMI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
      />
    </div>
  );
}
