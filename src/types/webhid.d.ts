// WebHID 最小类型声明（TS 内置 DOM 库未包含）
interface HIDReportInfo { reportId: number }
interface HIDCollectionInfo { usagePage?: number; usage?: number; outputReports?: HIDReportInfo[]; inputReports?: HIDReportInfo[] }
interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
}
interface HIDDeviceFilter { vendorId?: number; productId?: number }
interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>;
}
interface Navigator { readonly hid?: HID }
