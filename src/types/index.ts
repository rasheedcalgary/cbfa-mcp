/**
 * Shared TypeScript types for the CBA-MCP server.
 *
 * These interfaces mirror the unified CSV schema and are used
 * across tools, clients, and the data layer.
 */

// ─── App Data ─────────────────────────────────────────────────────────────────

/** A single Custom Branded App, as parsed from the data source. */
export interface AppRecord {
  /** Primary key — reverse-DNS bundle ID (CSV: Code) */
  bundle_id: string;
  /** Human-readable app name (CSV: Name) */
  display_name: string;
  /** Product line: Enterprise | Studio | Pro (CSV: AppType, lowercased) */
  app_type: AppType;
  /** Business owner — "ABC" or "Trainerize" (CSV: BusinessType) */
  team_name: string;
  /** Gym group identifier (CSV: GroupID) */
  group_id: string;
  /** Apple Store account email (CSV: AppleStoreAccount) */
  apple_id: string;
  /** ABC sub-type, or "N/A" for non-ABC apps (CSV: AppType) */
  abc_app_type: string;

  // ── Overall CBA workflow status ───────────────────────────────
  /** Overall CBA lifecycle status — Published | WaitingForArtwork | Notified |
   *  Submitted | PendingPublish | ReceivedArtifacts | Deactivated (CSV: Status) */
  status: string;

  // ── iOS ──────────────────────────────────────────────────────
  ios_version: string;
  /** Apple App Store status — ReadyForSale | None (CSV: IOSStoreStatus) */
  app_store_state: string;
  /** Apple Store account email — repurposed from legacy apple_key_valid field (CSV: AppleStoreAccount) */
  apple_key_valid: string;
  /** Apple Developer Program membership status — AgreementIsMissing | Active | Expired | etc. (CSV: IOSMembership) */
  ios_membership: string;
  watch_face: string;

  // ── Android ──────────────────────────────────────────────────
  android_version: string;
  android_store_state: string;
  /** Google Play Store account email (CSV: PlayStoreAccount) */
  google_key_valid: string;

  // ── Timestamps ───────────────────────────────────────────────
  /** Date app was published to App Store (CSV: Published) */
  last_ios_updated: string;
  /** App creation date (CSV: Created) */
  last_android_updated: string;

  // ── CI/CD ─────────────────────────────────────────────────────
  /** Apple Team ID (CSV: TeamID) */
  bitrise_workflow: string;
  /** Row creation date (CSV: Created) */
  dump_date: string;
}

/** Supported app product lines */
export type AppType = "enterprise" | "studio" | "pro" | "abc";

// ─── CI/CD ────────────────────────────────────────────────────────────────────

/** Supported CI/CD providers for action tools */
export type CiProvider = "bitrise" | "jenkins";

/** Supported build target platforms */
export type BuildPlatform = "ios" | "android" | "both";

/** Result returned after triggering a build */
export interface BuildTriggerResult {
  build_id: string;
  status: "queued";
  provider: CiProvider;
  triggered_at: string;
  build_url: string;
}

/** Status of an in-progress or completed build */
export interface BuildStatusResult {
  build_id: string;
  status: BuildStatus;
  provider: CiProvider;
  triggered_at: string;
  duration_seconds?: number;
  build_url: string;
  logs_url?: string;
}

export type BuildStatus = "queued" | "running" | "succeeded" | "failed" | "aborted";

// ─── Tool Responses ───────────────────────────────────────────────────────────

/** Standard MCP tool text response */
export interface McpTextContent {
  type: "text";
  text: string;
}

// ─── Trainerize Admin API Response Types ──────────────────────────────────────

/**
 * Response from POST /v03/sys/getNativeApp
 * Returns live app metadata keyed by appCode (bundle ID).
 */
export interface GetNativeAppResponse {
  appName: string;
  appCode: string;
  appType: string;
  status: string;
  planCode: number;
  downgradeDate: string | null;
  groupId: number;
  businessType: string;
  appleStoreAccount: string;
  playStoreAccount: string;
}

/**
 * Deep settings object returned by GET /v03/CBA/GetNativeAppGroupSettings
 */
export interface NativeAppGroupSettings {
  groupID: number;
  nativeAppID: number;
  nativeAppName: string;
  appDescription: string;
  nativeAppCode: string;
  iOSID: string;
  created: string;
  pushNotificationExpiryDate: string;
  iOSStoreLink: string;
  androidStoreLink: string;
  appType: string;
  appStatus: string;
  appRebrandStatus: string;
  appleStoreAccount: string;
  playStoreAccount: string;
  androidDisplayName: string;
  className: string;
  marketUrl: string;
  appBarMode: string;
  loginMode: string;
  signinButtonTheme: string;
  appThemeMode: string;
  launchScreenBackgroundColor: string;
  showWatchFaceDownload: boolean;
  androidProjectID: number;
  useNewAndroidKey: boolean;
  supportEmail: string;
  fAQclientLink: string;
  fAQtrainerLink: string;
  videoGuideClientLink: string;
  videoGuideTrainerLink: string;
  videoGuideAdminLink: string;
  loginHelpEmail: string;
  loginHelpPhone: string;
  profileUUID: string;
  profileName: string;
  teamID: string;
  teamName: string;
  itcTeamID: number;
  appStoreApiKey: string;
  issuerID: string;
  publishAfterApprove: boolean;
  submitForReview: boolean;
  skipMetadata: boolean;
  whiteLabelAppType: string;
  abcAppType: string;
  figmaFileID: string;
  proAndroidAccount: string;
}

export interface GetNativeAppGroupSettingsResponse {
  settings: NativeAppGroupSettings;
}

/**
 * Response from GET /v03/CBA/getAppBuildQueue
 * Returns a list of app bundle IDs currently in the requested queue state.
 */
export interface GetAppBuildQueueResponse {
  apps: string[];
}
