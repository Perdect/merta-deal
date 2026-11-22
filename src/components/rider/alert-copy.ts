"use client";
import * as React from "react";
import { ALERT_COPY_KEYS, type AlertCopy, type AlertCopyKey } from "@/components/alerts/alert-setup";
import { translate, useRiderLang, type TKey } from "@/lib/rider-i18n";

/** Every word of the shared alert setup has a rider line (`alertSetup.<key>`); a missing one fails the build here. */
type RiderAlertKey = `alertSetup.${AlertCopyKey}`;
const riderKey = (k: AlertCopyKey): RiderAlertKey & TKey => `alertSetup.${k}`;

/** The shared AlertSetup / AlertBanner wording in the rider's language. */
export function useAlertCopy(): AlertCopy {
  const lang = useRiderLang((s) => s.lang);
  return React.useMemo(() => Object.fromEntries(ALERT_COPY_KEYS.map((k) => [k, translate(lang, riderKey(k))])) as AlertCopy, [lang]);
}
