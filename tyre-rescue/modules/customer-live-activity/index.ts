import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface CustomerLiveActivityState {
  status: string;
  driverName: string;
  estimatedArrivalAt: number | null;
  updatedAt: number;
  staleAt: number;
}

export interface CustomerLiveActivity {
  refNumber: string;
  activityId: string;
  pushToken: string | null;
  environment: 'production' | 'sandbox';
}

export type CustomerLiveActivityToken = CustomerLiveActivity & { pushToken: string };
export type LiveActivityState = CustomerLiveActivityState;
export type LiveActivityInfo = CustomerLiveActivity;
interface NativeLiveActivity {
  isSupported(): Promise<boolean>;
  getActivities(): Promise<CustomerLiveActivity[]>;
  startOrUpdate(refNumber: string, state: CustomerLiveActivityState): Promise<void>;
  end(refNumber: string, state: CustomerLiveActivityState | null): Promise<void>;
  endAll(): Promise<void>;
  addListener(event: 'onPushToken', listener: (event: CustomerLiveActivityToken) => void): { remove(): void };
}

// Expo Go, web and Android do not include this local iOS module.
const native = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeLiveActivity>('CustomerLiveActivity') : null;

const customerLiveActivity = {
  isSupported: () => native?.isSupported() ?? Promise.resolve(false),
  getActivities: () => native?.getActivities() ?? Promise.resolve([]),
  startOrUpdate: (refNumber: string, state: CustomerLiveActivityState) => native?.startOrUpdate(refNumber, state) ?? Promise.resolve(),
  end: (refNumber: string, state?: CustomerLiveActivityState) => native?.end(refNumber, state ?? null) ?? Promise.resolve(),
  endAll: () => native?.endAll() ?? Promise.resolve(),
  addPushTokenListener: (listener: (event: CustomerLiveActivityToken) => void) => native?.addListener('onPushToken', listener) ?? { remove() {} },
};

export default customerLiveActivity;
