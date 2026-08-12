import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPlatform } = vi.hoisted(() => ({
  mockPlatform: { OS: 'ios' as string },
}));
vi.mock('react-native', () => ({
  Platform: mockPlatform,
  TurboModuleRegistry: { get: vi.fn(() => null) },
}));

vi.mock('@windforge/react-native', () => ({
  selectBackend: vi.fn(),
  setFabricNativeAdapter: vi.fn(),
}));

import { TurboModuleRegistry } from 'react-native';
import { selectBackend, setFabricNativeAdapter } from '@windforge/react-native';
import {
  createNativeStyleAdapter,
  installNativeDelivery,
  uninstallNativeDelivery,
} from '../src/index.js';
import { getWindforgeStyleModule } from '../src/module.js';

function createMockNativeModule() {
  return {
    registerStyles: vi.fn(),
    updateStyles: vi.fn(),
    link: vi.fn(),
    suspend: vi.fn(),
    unlink: vi.fn(),
    getDiagnostics: vi.fn((callback: (result: unknown) => void) =>
      callback({ available: true }),
    ),
  };
}

beforeEach(() => {
  mockPlatform.OS = 'ios';
  vi.mocked(TurboModuleRegistry.get).mockReturnValue(null);
  vi.mocked(selectBackend).mockClear();
  vi.mocked(setFabricNativeAdapter).mockClear();
});

describe('getWindforgeStyleModule', () => {
  it('returns null when the module is not registered', () => {
    expect(getWindforgeStyleModule()).toBeNull();
  });

  it('returns the registered module', () => {
    const module = createMockNativeModule();
    vi.mocked(TurboModuleRegistry.get).mockReturnValue(module);
    expect(getWindforgeStyleModule()).toBe(module);
  });
});

describe('createNativeStyleAdapter', () => {
  it('forwards every protocol call to the native module', () => {
    const module = createMockNativeModule();
    const adapter = createNativeStyleAdapter(module);

    adapter.registerStyles({ 'p-4': { padding: 16 } });
    adapter.updateStyles({ 'bg-zinc-950': { backgroundColor: '#fafafa' } });
    adapter.link(101, 'p-4');
    adapter.suspend(101);
    adapter.unlink(101);

    expect(module.registerStyles).toHaveBeenCalledWith({ 'p-4': { padding: 16 } });
    expect(module.updateStyles).toHaveBeenCalledWith({
      'bg-zinc-950': { backgroundColor: '#fafafa' },
    });
    expect(module.link).toHaveBeenCalledWith(101, 'p-4');
    expect(module.suspend).toHaveBeenCalledWith(101);
    expect(module.unlink).toHaveBeenCalledWith(101);
  });
});

describe('installNativeDelivery', () => {
  it('is a silent no-op on web', () => {
    mockPlatform.OS = 'web';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installNativeDelivery();
    expect(selectBackend).not.toHaveBeenCalled();
    expect(setFabricNativeAdapter).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('selects the fabric backend and installs the adapter when the module exists', () => {
    vi.mocked(TurboModuleRegistry.get).mockReturnValue(createMockNativeModule());
    installNativeDelivery();
    expect(setFabricNativeAdapter).toHaveBeenCalledTimes(1);
    const adapter = vi.mocked(setFabricNativeAdapter).mock.calls[0]?.[0];
    expect(adapter).toBeTruthy();
    expect(adapter?.link).toBeTypeOf('function');
    expect(selectBackend).toHaveBeenCalledWith('fabric');
  });

  it('warns and stays on the baseline backend when the module is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installNativeDelivery();
    expect(selectBackend).not.toHaveBeenCalled();
    expect(setFabricNativeAdapter).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WindforgeStyle'));
    warn.mockRestore();
  });
});

describe('uninstallNativeDelivery', () => {
  it('clears the adapter and returns to the baseline backend', () => {
    uninstallNativeDelivery();
    expect(setFabricNativeAdapter).toHaveBeenCalledWith(null);
    expect(selectBackend).toHaveBeenCalledWith('js-baseline');
  });
});
