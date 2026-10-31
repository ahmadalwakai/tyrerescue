import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface NativeCustomerTyreScanner {
  recognizeText(imageUri: string): Promise<string>;
}

// A native rebuild includes this module. Web and Expo Go keep manual size entry.
const native = Platform.OS === 'ios' || Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeCustomerTyreScanner>('CustomerTyreScanner')
  : null;

const customerTyreScanner = {
  isSupported: () => native !== null,
  recognizeText: (imageUri: string): Promise<string> => {
    if (!native) return Promise.reject(new Error('Tyre photo scanning is not available in this app version. Enter the size manually.'));
    return native.recognizeText(imageUri);
  },
};

export default customerTyreScanner;
