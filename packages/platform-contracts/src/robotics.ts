import type { ReleaseChannel } from './constants.js';

export type RoboticsDatasetFormat =
  | 'lerobot_v3'
  | 'lerobot_v2'
  | 'rlds'
  | 'openx'
  | 'hdf5'
  | 'rosbag2'
  | 'rosbag1'
  | 'folder_mp4_jsonl';

export type RoboticsPlatformHookKind =
  | 'video_decode'
  | 'dataset_stream'
  | 'ros_bag_adapter';

export interface RoboticsPlatformHook {
  id: string;
  kind: RoboticsPlatformHookKind;
  channel: ReleaseChannel;
  owner: 'open-studio-platform';
  consumedBy: 'robotics-studio-open';
}

export const ROBOTICS_PLATFORM_HOOKS: readonly RoboticsPlatformHook[] = [
  {
    id: 'video.decode.videotoolbox',
    kind: 'video_decode',
    channel: 'stable',
    owner: 'open-studio-platform',
    consumedBy: 'robotics-studio-open',
  },
  {
    id: 'video.decode.vaapi',
    kind: 'video_decode',
    channel: 'stable',
    owner: 'open-studio-platform',
    consumedBy: 'robotics-studio-open',
  },
  {
    id: 'video.decode.nvdec',
    kind: 'video_decode',
    channel: 'beta',
    owner: 'open-studio-platform',
    consumedBy: 'robotics-studio-open',
  },
  {
    id: 'dataset.stream.chunked_ipc',
    kind: 'dataset_stream',
    channel: 'stable',
    owner: 'open-studio-platform',
    consumedBy: 'robotics-studio-open',
  },
  {
    id: 'dataset.stream.sqlite_sidecar_index',
    kind: 'dataset_stream',
    channel: 'stable',
    owner: 'open-studio-platform',
    consumedBy: 'robotics-studio-open',
  },
  {
    id: 'ros.rosbag2_sqlite',
    kind: 'ros_bag_adapter',
    channel: 'stable',
    owner: 'open-studio-platform',
    consumedBy: 'robotics-studio-open',
  },
  {
    id: 'ros.rosbag1_legacy',
    kind: 'ros_bag_adapter',
    channel: 'beta',
    owner: 'open-studio-platform',
    consumedBy: 'robotics-studio-open',
  },
];

export const ROBOTICS_TELEMETRY_FEATURE_IDS = [
  'dataset.open',
  'episode.scrub',
  'sensor.visibility_toggle',
  'failure.cluster',
  'failure.cross_dataset_search',
  'vla.probe',
  'sensor_qa.run',
  'export.hf_hub',
  'export.local_disk',
  'export.auraone_intake',
] as const;

export type RoboticsTelemetryFeatureId =
  (typeof ROBOTICS_TELEMETRY_FEATURE_IDS)[number];
