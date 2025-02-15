interface BluetoothDevice {
    name?: string;
    id: string;
  }
  
  interface Navigator {
    bluetooth: {
      requestDevice(options: { acceptAllDevices: boolean }): Promise<BluetoothDevice>;
    }
  }