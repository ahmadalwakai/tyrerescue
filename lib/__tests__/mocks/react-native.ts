export const Platform = {
  OS: 'ios',
  select<T>(options: Partial<Record<string, T>>): T | undefined {
    return options.ios ?? options.default;
  },
};

export const NativeModules = {};
