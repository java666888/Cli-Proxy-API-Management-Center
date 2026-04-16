/**
 * Generic quota section component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type { AuthFileItem, CodexQuotaState, CodexQuotaWindow, ResolvedTheme } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import { QuotaCard } from './QuotaCard';
import type { QuotaStatusState } from './QuotaCard';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import { useGridColumns } from './useGridColumns';
import { IconRefreshCw } from '@/components/ui/icons';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

type ViewMode = 'paged' | 'all';
type CodexSortMode = 'remaining-desc' | 'remaining-asc';

const MAX_ITEMS_PER_PAGE = 25;
const CODEX_WEEKLY_WINDOW_ID = 'weekly';
const CODEX_CODE_REVIEW_WEEKLY_WINDOW_ID = 'code-review-weekly';

interface CodexOverviewSummary {
  remainingPercent: number | null;
  usedPercent: number | null;
  includedCount: number;
  totalCount: number;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const getCodexWindowById = (
  quota: CodexQuotaState | undefined,
  windowId: string
): CodexQuotaWindow | null => {
  if (quota?.status !== 'success') return null;
  return quota.windows.find((window) => window.id === windowId) ?? null;
};

const getRemainingPercentFromUsed = (usedPercent: number | null | undefined): number | null => {
  if (usedPercent === null || usedPercent === undefined || Number.isNaN(usedPercent)) {
    return null;
  }
  return clampPercent(100 - clampPercent(usedPercent));
};

const buildCodexOverviewSummary = (
  files: AuthFileItem[],
  quotaByFile: Record<string, CodexQuotaState>,
  windowId: string
): CodexOverviewSummary => {
  let includedCount = 0;
  let remainingTotal = 0;

  files.forEach((file) => {
    const remainingPercent = getRemainingPercentFromUsed(
      getCodexWindowById(quotaByFile[file.name], windowId)?.usedPercent
    );
    if (remainingPercent === null) return;

    includedCount += 1;
    remainingTotal += remainingPercent;
  });

  if (includedCount === 0) {
    return {
      remainingPercent: null,
      usedPercent: null,
      includedCount,
      totalCount: files.length
    };
  }

  const averageRemaining = remainingTotal / includedCount;
  return {
    remainingPercent: averageRemaining,
    usedPercent: 100 - averageRemaining,
    includedCount,
    totalCount: files.length
  };
};

interface QuotaPaginationState<T> {
  pageSize: number;
  totalPages: number;
  currentPage: number;
  pageItems: T[];
  setPageSize: (size: number) => void;
  goToPrev: () => void;
  goToNext: () => void;
  loading: boolean;
  loadingScope: 'page' | 'all' | null;
  setLoading: (loading: boolean, scope?: 'page' | 'all' | null) => void;
}

const useQuotaPagination = <T,>(items: T[], defaultPageSize = 6): QuotaPaginationState<T> => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [loading, setLoadingState] = useState(false);
  const [loadingScope, setLoadingScope] = useState<'page' | 'all' | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize]
  );

  const currentPage = useMemo(() => Math.min(page, totalPages), [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const goToPrev = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const setLoading = useCallback((isLoading: boolean, scope?: 'page' | 'all' | null) => {
    setLoadingState(isLoading);
    setLoadingScope(isLoading ? (scope ?? null) : null);
  }, []);

  return {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    loading,
    loadingScope,
    setLoading
  };
};

interface QuotaSectionProps<TState extends QuotaStatusState, TData> {
  config: QuotaConfig<TState, TData>;
  files: AuthFileItem[];
  loading: boolean;
  disabled: boolean;
}

export function QuotaSection<TState extends QuotaStatusState, TData>({
  config,
  files,
  loading,
  disabled
}: QuotaSectionProps<TState, TData>) {
  const { t } = useTranslation();
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  const [columns, gridRef] = useGridColumns(380); // Min card width 380px matches SCSS
  const [viewMode, setViewMode] = useState<ViewMode>('paged');
  const [codexSortMode, setCodexSortMode] = useState<CodexSortMode>('remaining-desc');

  const filteredFiles = useMemo(() => files.filter((file) => config.filterFn(file)), [
    files,
    config
  ]);
  const { quota, loadQuota } = useQuotaLoader(config);
  const codexQuota =
    config.type === 'codex' ? (quota as unknown as Record<string, CodexQuotaState>) : null;
  const isCodexSection = config.type === 'codex';

  const hasCodexBootstrapData = useMemo(() => {
    if (!isCodexSection || !codexQuota) return false;

    return filteredFiles.some((file) => {
      const fileQuota = codexQuota[file.name];
      return Boolean(
        getCodexWindowById(fileQuota, CODEX_WEEKLY_WINDOW_ID) ||
          getCodexWindowById(fileQuota, CODEX_CODE_REVIEW_WEEKLY_WINDOW_ID)
      );
    });
  }, [codexQuota, filteredFiles, isCodexSection]);

  const sortedFiles = useMemo(() => {
    if (!isCodexSection || !codexQuota) return filteredFiles;

    return filteredFiles
      .map((file, index) => ({
        file,
        index,
        remainingPercent: getRemainingPercentFromUsed(
          getCodexWindowById(codexQuota[file.name], CODEX_WEEKLY_WINDOW_ID)?.usedPercent
        )
      }))
      .sort((left, right) => {
        const leftValue = left.remainingPercent;
        const rightValue = right.remainingPercent;
        const leftHasValue = leftValue !== null;
        const rightHasValue = rightValue !== null;

        if (leftHasValue && !rightHasValue) return -1;
        if (!leftHasValue && rightHasValue) return 1;
        if (!leftHasValue && !rightHasValue) return left.index - right.index;

        const difference =
          codexSortMode === 'remaining-desc'
            ? (rightValue as number) - (leftValue as number)
            : (leftValue as number) - (rightValue as number);
        return difference !== 0 ? difference : left.index - right.index;
      })
      .map((entry) => entry.file);
  }, [codexQuota, codexSortMode, filteredFiles, isCodexSection]);

  const {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPrev,
    goToNext,
    loading: sectionLoading,
    setLoading
  } = useQuotaPagination(sortedFiles);

  const effectiveViewMode = viewMode;

  // Update page size based on view mode and columns
  useEffect(() => {
    if (effectiveViewMode === 'all') {
      setPageSize(Math.max(1, sortedFiles.length));
    } else {
      // Paged mode: 3 rows * columns, capped to avoid oversized pages.
      setPageSize(Math.min(columns * 3, MAX_ITEMS_PER_PAGE));
    }
  }, [effectiveViewMode, columns, sortedFiles.length, setPageSize]);

  const pendingQuotaRefreshRef = useRef(false);
  const prevFilesLoadingRef = useRef(loading);
  const codexBootstrapAttemptRef = useRef<string | null>(null);

  const codexBootstrapKey = useMemo(
    () => filteredFiles.map((file) => file.name).sort().join('|'),
    [filteredFiles]
  );

  const handleRefresh = useCallback(() => {
    pendingQuotaRefreshRef.current = true;
    void triggerHeaderRefresh();
  }, []);

  useEffect(() => {
    codexBootstrapAttemptRef.current = null;
  }, [codexBootstrapKey]);

  const ensureCodexBootstrapData = useCallback(() => {
    if (!isCodexSection) return;
    if (loading || sectionLoading) return;
    if (filteredFiles.length === 0) return;
    if (hasCodexBootstrapData) return;
    if (codexBootstrapAttemptRef.current === codexBootstrapKey) return;

    codexBootstrapAttemptRef.current = codexBootstrapKey;
    void loadQuota(filteredFiles, 'all', setLoading);
  }, [
    codexBootstrapKey,
    filteredFiles,
    hasCodexBootstrapData,
    isCodexSection,
    loadQuota,
    loading,
    sectionLoading,
    setLoading
  ]);

  useEffect(() => {
    const wasLoading = prevFilesLoadingRef.current;
    prevFilesLoadingRef.current = loading;

    if (!pendingQuotaRefreshRef.current) return;
    if (loading) return;
    if (!wasLoading) return;

    pendingQuotaRefreshRef.current = false;
    if (filteredFiles.length === 0) return;
    loadQuota(filteredFiles, 'all', setLoading);
  }, [filteredFiles, loadQuota, loading, setLoading]);

  useEffect(() => {
    if (loading) return;
    if (filteredFiles.length === 0) {
      setQuota({});
      return;
    }
    setQuota((prev) => {
      const nextState: Record<string, TState> = {};
      filteredFiles.forEach((file) => {
        const cached = prev[file.name];
        if (cached) {
          nextState[file.name] = cached;
        }
      });
      return nextState;
    });
  }, [filteredFiles, loading, setQuota]);

  const codexWeeklyOverview = useMemo(() => {
    if (!isCodexSection || !codexQuota) return null;
    return buildCodexOverviewSummary(filteredFiles, codexQuota, CODEX_WEEKLY_WINDOW_ID);
  }, [codexQuota, filteredFiles, isCodexSection]);

  const codexCodeReviewOverview = useMemo(() => {
    if (!isCodexSection || !codexQuota) return null;
    return buildCodexOverviewSummary(filteredFiles, codexQuota, CODEX_CODE_REVIEW_WEEKLY_WINDOW_ID);
  }, [codexQuota, filteredFiles, isCodexSection]);

  const refreshQuotaForFile = useCallback(
    async (file: AuthFileItem) => {
      if (disabled || file.disabled) return;
      if (quota[file.name]?.status === 'loading') return;

      setQuota((prev) => ({
        ...prev,
        [file.name]: config.buildLoadingState()
      }));

      try {
        const data = await config.fetchQuota(file, t);
        setQuota((prev) => ({
          ...prev,
          [file.name]: config.buildSuccessState(data)
        }));
        showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('common.unknown_error');
        const status = getStatusFromError(err);
        setQuota((prev) => ({
          ...prev,
          [file.name]: config.buildErrorState(message, status)
        }));
        showNotification(
          t('auth_files.quota_refresh_failed', { name: file.name, message }),
          'error'
        );
      }
    },
    [config, disabled, quota, setQuota, showNotification, t]
  );

  const renderCodexOverviewCard = useCallback(
    (
      summary: CodexOverviewSummary,
      options: { titleKey: string; emptyKey: string }
    ) => {
      const displayPercent =
        summary.remainingPercent === null ? null : Math.round(summary.remainingPercent);
      const usedPercent = summary.usedPercent === null ? null : Math.round(summary.usedPercent);
      const donutStyle: CSSProperties | undefined =
        displayPercent === null
          ? undefined
          : {
              background: `conic-gradient(
                color-mix(in srgb, var(--success-color, #22c55e) 88%, white) 0 ${displayPercent}%,
                color-mix(in srgb, var(--danger-color, #ef4444) 86%, white) ${displayPercent}% 100%
              )`
            };
      const emptyLabel =
        sectionLoading && summary.includedCount === 0 ? t('common.loading') : t(options.emptyKey);

      return (
        <div key={options.titleKey} className={styles.codexOverviewCard}>
          <div className={styles.codexOverviewHeader}>
            <span className={styles.codexOverviewTitle}>{t(options.titleKey)}</span>
            <span className={styles.codexOverviewCoverage}>
              {t('codex_quota.overview_coverage', {
                included: summary.includedCount,
                total: summary.totalCount
              })}
            </span>
          </div>
          <div className={styles.codexOverviewBody}>
            <div
              className={`${styles.codexOverviewDonut} ${
                displayPercent === null ? styles.codexOverviewDonutEmpty : ''
              }`}
              style={donutStyle}
            >
              <div className={styles.codexOverviewDonutInner}>
                {displayPercent === null ? (
                  <span className={styles.codexOverviewEmpty}>{emptyLabel}</span>
                ) : (
                  <>
                    <span className={styles.codexOverviewPercent}>{displayPercent}%</span>
                    <span className={styles.codexOverviewPercentLabel}>
                      {t('codex_quota.overview_remaining')}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className={styles.codexOverviewStats}>
              <div className={styles.codexOverviewStat}>
                <span className={styles.codexOverviewStatLabel}>
                  {t('codex_quota.overview_remaining')}
                </span>
                <span className={styles.codexOverviewStatValue}>
                  {displayPercent === null ? '--' : `${displayPercent}%`}
                </span>
              </div>
              <div className={styles.codexOverviewStat}>
                <span className={styles.codexOverviewStatLabel}>
                  {t('codex_quota.overview_used')}
                </span>
                <span className={styles.codexOverviewStatValue}>
                  {usedPercent === null ? '--' : `${usedPercent}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    },
    [sectionLoading, t]
  );

  const displayedItems = effectiveViewMode === 'all' ? sortedFiles : pageItems;

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t(`${config.i18nPrefix}.title`)}</span>
      {filteredFiles.length > 0 && (
        <span className={styles.countBadge}>
          {filteredFiles.length}
        </span>
      )}
    </div>
  );

  const isRefreshing = sectionLoading || loading;

  return (
    <Card
      title={titleNode}
      extra={
        <div className={styles.headerActions}>
          <div className={styles.viewModeToggle}>
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.viewModeButton} ${
                effectiveViewMode === 'paged' ? styles.viewModeButtonActive : ''
              }`}
              onClick={() => {
                ensureCodexBootstrapData();
                setViewMode('paged');
              }}
            >
              {t('auth_files.view_mode_paged')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.viewModeButton} ${
                effectiveViewMode === 'all' ? styles.viewModeButtonActive : ''
              }`}
              onClick={() => {
                ensureCodexBootstrapData();
                setViewMode('all');
              }}
            >
              {t('auth_files.view_mode_all')}
            </Button>
          </div>
          {isCodexSection && (
            <div className={styles.sortToggle}>
              <Button
                variant="secondary"
                size="sm"
                className={`${styles.sortButton} ${
                  codexSortMode === 'remaining-desc' ? styles.sortButtonActive : ''
                }`}
                onClick={() => {
                  ensureCodexBootstrapData();
                  setCodexSortMode('remaining-desc');
                }}
              >
                {t('codex_quota.sort_high_to_low')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={`${styles.sortButton} ${
                  codexSortMode === 'remaining-asc' ? styles.sortButtonActive : ''
                }`}
                onClick={() => {
                  ensureCodexBootstrapData();
                  setCodexSortMode('remaining-asc');
                }}
              >
                {t('codex_quota.sort_low_to_high')}
              </Button>
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            className={styles.refreshAllButton}
            onClick={handleRefresh}
            disabled={disabled || isRefreshing}
            loading={isRefreshing}
            title={t('quota_management.refresh_all_credentials')}
            aria-label={t('quota_management.refresh_all_credentials')}
          >
            {!isRefreshing && <IconRefreshCw size={16} />}
            {t('quota_management.refresh_all_credentials')}
          </Button>
        </div>
      }
    >
      {filteredFiles.length === 0 ? (
        <EmptyState
          title={t(`${config.i18nPrefix}.empty_title`)}
          description={t(`${config.i18nPrefix}.empty_desc`)}
        />
      ) : (
        <>
          {isCodexSection && codexWeeklyOverview && codexCodeReviewOverview && (
            <div className={styles.codexOverviewRow}>
              {renderCodexOverviewCard(codexWeeklyOverview, {
                titleKey: 'codex_quota.overview_weekly_quota',
                emptyKey: 'codex_quota.overview_weekly_empty'
              })}
              {renderCodexOverviewCard(codexCodeReviewOverview, {
                titleKey: 'codex_quota.overview_code_review_weekly_quota',
                emptyKey: 'codex_quota.overview_code_review_weekly_empty'
              })}
            </div>
          )}
          <div ref={gridRef} className={config.gridClassName}>
            {displayedItems.map((item) => (
              <QuotaCard
                key={item.name}
                item={item}
                quota={quota[item.name]}
                resolvedTheme={resolvedTheme}
                i18nPrefix={config.i18nPrefix}
                cardIdleMessageKey={config.cardIdleMessageKey}
                cardClassName={config.cardClassName}
                defaultType={config.type}
                canRefresh={!disabled && !item.disabled}
                onRefresh={() => void refreshQuotaForFile(item)}
                renderQuotaItems={config.renderQuotaItems}
              />
            ))}
          </div>
          {filteredFiles.length > pageSize && effectiveViewMode === 'paged' && (
            <div className={styles.pagination}>
              <Button
                variant="secondary"
                size="sm"
                onClick={goToPrev}
                disabled={currentPage <= 1}
              >
                {t('auth_files.pagination_prev')}
              </Button>
              <div className={styles.pageInfo}>
                {t('auth_files.pagination_info', {
                  current: currentPage,
                  total: totalPages,
                  count: filteredFiles.length
                })}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={goToNext}
                disabled={currentPage >= totalPages}
              >
                {t('auth_files.pagination_next')}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
