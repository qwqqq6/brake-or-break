// WebHID 最小类型声明（TS 内置 DOM 库未包含）
interface HIDReportItem { reportSize?: number; reportCount?: number }
interface HIDReportInfo { reportId: number; items?: HIDReportItem[] }
interface HIDCollectionInfo { usagePage?: number; usage?: number; outputReports?: HIDReportInfo[]; inputReports?: HIDReportInfo[]; featureReports?: HIDReportInfo[] }
interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
}
interface HIDDeviceFilter { vendorId?: number; productId?: number }
interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>;
}
interface Navigator { readonly hid?: HID }
