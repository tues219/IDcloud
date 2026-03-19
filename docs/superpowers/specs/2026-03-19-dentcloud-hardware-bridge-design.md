# DentCloud Hardware Bridge — Design Spec

## Overview

Electron desktop application ที่รวม 3 external apps (Card Reader, EDC Interface, Xray Uploader) เข้าเป็น app เดียว ทำหน้าที่เป็น Hardware Bridge ให้ DentCloud frontend ที่ยังรันใน browser เหมือนเดิม

## Goals

- User เปิดแค่ app เดียวแทน 3 app
- เสถียรกว่าเดิม (auto-reconnect, retry, timeout)
- Cross-platform: Windows (หลัก) + macOS
- Frontend (Vue 2 SPA) ไม่ต้องแก้มาก — ยังเปิดผ่าน browser

## Architecture

```
┌─────────────┐        WS :9900        ┌──────────────────────┐
│   Browser   │◄──────────────────────►│   Electron App       │
│  Vue 2 SPA  │  card-reader / edc     │  ┌─ Card Reader      │
│             │                        │  ├─ EDC Interface     │
└─────────────┘                        │  └─ Xray Uploader ───┼──► Backend API
                                       └──────────────────────┘
                                                  │
                                       USB/Serial + File System
```

- **Frontend** ยังเปิดใน browser, deploy/update อิสระ
- **Electron app** เป็น Hardware Bridge เท่านั้น ไม่ bundle frontend
- **Xray Uploader** ทำงาน background upload ไป backend API ตรงๆ ไม่ผ่าน WebSocket
- **Dashboard** รับสถานะจาก modules ผ่าน Electron IPC (ไม่ใช่ WebSocket)

## Project Structure

```
dentcloud-hardware-bridge/
├── src/
│   ├── main/
│   │   ├── index.js              # Electron main process entry
│   │   ├── preload.js            # Preload script
│   │   ├── tray.js               # System tray management
│   │   ├── logger.js             # Unified logging (file-based + rotation)
│   │   ├── config-store.js       # Unified config via electron-store
│   │   └── modules/
│   │       ├── card-reader.js    # Smart card reader module
│   │       ├── edc-interface.js  # EDC serial port module
│   │       └── xray-uploader.js  # DICOM file watcher + uploader
│   ├── ws-server/
│   │   ├── index.js              # WebSocket server (single port 9900)
│   │   └── handlers/
│   │       ├── card-reader.js    # Handle card read requests
│   │       └── edc.js            # Handle EDC payment requests
│   ├── renderer/
│   │   ├── index.html            # Settings/status dashboard UI
│   │   ├── css/styles.css
│   │   └── js/app.js
│   └── shared/
│       └── config.js             # Shared configuration defaults
├── package.json
└── electron-builder.yml
```

## WebSocket Protocol

### Connection

- Single port: **9900** (ตรวจจับ port-in-use ก่อนเปิด → แจ้ง error ถ้าชน)
- Frontend connect → Bridge sends `{ "event": "connected", "version": "1.0.0" }`
- Ping/pong heartbeat ทุก 30 วินาที
- Auto-reconnect ฝั่ง frontend ถ้า disconnect
- รองรับ multiple clients (SmartCard.vue และ DcPaymentWebsocket.vue ต่อแยกกันได้)

### Message Format

```json
// Frontend → Bridge (Request)
{
  "id": "uuid",
  "type": "card-reader|edc",
  "action": "read|pay|cancel|reprint|status",
  "data": { ... }
}

// Bridge → Frontend (Response)
{
  "id": "uuid",
  "type": "card-reader|edc",
  "event": "success|error|progress",
  "data": { ... }
}
```

### Card Reader Messages

```json
// Request: อ่านบัตร
→ { "id": "1", "type": "card-reader", "action": "read" }

// Response: ข้อมูลบัตร (field names match existing SmartCard.vue expectations)
← { "id": "1", "type": "card-reader", "event": "success",
    "data": {
      "success": true,
      "personal": {
        "Citizenid": "1234567890123",
        "Th_Prefix": "นาย",
        "Th_Firstname": "...",
        "Th_Lastname": "...",
        "En_Prefix": "MR.",
        "En_Firstname": "...",
        "En_Lastname": "...",
        "Birthday": "...",
        "Gender": "...",
        "Address": { ... },
        "Photo": "base64..."
      }
    }
  }

// Unsolicited events
← { "type": "card-reader", "event": "card-inserted" }
← { "type": "card-reader", "event": "card-removed" }
```

### EDC Messages

```json
// Request: ชำระเงิน
→ { "id": "2", "type": "edc", "action": "pay",
    "data": { "amount": 1500, "method": "card" } }

// Progress: ระหว่างรอ
← { "id": "2", "type": "edc", "event": "progress",
    "data": { "message": "รอผู้ป่วยแตะบัตร..." } }

// Response: ผล transaction (field names match existing DcPaymentWebsocket.vue expectations)
← { "id": "2", "type": "edc", "event": "success",
    "data": {
      "AcknowledgeDateTime": "...",
      "AcknowLedgeCode": "...",
      "PresentationHeader": {
        "ResponseCode": "00",
        "TransactionCode": "20"
      },
      "FieldDatas": { ... }
    }
  }
```

### Error Codes

| Code | Module | Description |
|------|--------|-------------|
| `READER_NOT_FOUND` | card-reader | ไม่พบเครื่องอ่านบัตร |
| `READER_DISCONNECTED` | card-reader | เครื่องอ่านบัตรหลุด |
| `CARD_READ_TIMEOUT` | card-reader | อ่านบัตรไม่สำเร็จ timeout |
| `CARD_READ_FAILED` | card-reader | อ่านบัตรไม่สำเร็จ (retry หมดแล้ว) |
| `PORT_OPEN_FAILED` | edc | เปิด serial port ไม่ได้ |
| `PORT_DISCONNECTED` | edc | Serial port หลุด |
| `EDC_NO_ACK` | edc | EDC ไม่ตอบ ACK (retry หมดแล้ว) |
| `EDC_TIMEOUT` | edc | Transaction timeout |
| `EDC_CHECKSUM_ERROR` | edc | ข้อมูลจาก EDC เสียหาย |
| `WS_PORT_IN_USE` | system | Port 9900 ถูกใช้งานอยู่ |

## Module Design

### Card Reader Module

**Port จาก:** `dclou-card-reader` (Electron app เดิม)

| Item | Value |
|------|-------|
| Library | `smartcard` (คง lib เดิม — มี APDU command layer, ATR config สำหรับ 6+ reader types พร้อมแล้ว, เปลี่ยนเป็น `node-pcsclite` ต้อง rewrite มาก risk สูง) |
| หน้าที่ | ตรวจจับ reader → อ่านบัตรประชาชน → ส่งข้อมูลผ่าน WS |
| Push events | `card-inserted`, `card-removed` |
| Actions | `read` — อ่านข้อมูล + รูป |
| Dependencies | `smartcard`, `legacy-encoding`, `hex2imagebase64` (แปลง hex photo จากบัตรเป็น base64 JPEG) |
| Source files to port | `smc/helper/atr-config.js` (ATR config), `smc/helper/thai-id-card.js` (APDU commands), `smc/idcard.js` (main logic) |

**Stability:**

| ปัญหา | วิธีแก้ |
|--------|---------|
| Reader หลุด | Auto-detect + reconnect ทุก 3 วินาที |
| อ่านค้าง | Timeout 10 วินาที → แจ้ง error + retry อัตโนมัติ |
| อ่านไม่สำเร็จ | Retry สูงสุด 3 ครั้ง ก่อนแจ้ง error |
| สถานะไม่ชัด | Push status: `ready`, `reading`, `error`, `disconnected` |

### EDC Interface Module

**เขียนใหม่จาก:** `EdcInterfaceNet6` (.NET 6 → Node.js)

| Item | Value |
|------|-------|
| Library | `serialport` v12 |
| หน้าที่ | รับคำสั่งจาก WS → แปลงเป็น binary hex → ส่งผ่าน serial → parse response กลับ |
| Actions | `pay` (card/QR), `cancel`, `reprint` |
| Config | COM port, baud rate (9600), data bits, stop bits |
| Connection | USB mapped เป็น Serial Port |

**EDC Binary Protocol (port จาก .NET):**

Reference source files:
- `EdcInterface/MessageData/` — message structure definitions
- `EdcInterface/Utilities/ConvertMessageData.cs` — binary hex encoding/decoding
- `EdcInterface/Utilities/UtilitySerialPort.cs` — serial communication + ACK/NAK

Protocol structure:
```
[STX] [LENGTH (BCD)] [MESSAGE_DATA] [ETX] [LRC (XOR checksum)]
```

Message data contains:
- **Presentation Header**: format version, request/response indicator, transaction code
  - `20` = Card payment
  - `QR` = QR code payment
  - `26` = Cancel/void
  - `92` = Reprint
- **Field Data**: type-tagged fields (A1, A2, A3, 40, 65, 01, F1, etc.) each with own encoding
- **ACK/NAK handshake**: timer-based retry on NAK or no response

**Stability:**

| ปัญหา | วิธีแก้ |
|--------|---------|
| Port เปิดไม่ได้ | Retry เปิด port 3 ครั้ง, แจ้ง frontend ทันที |
| Port หลุดกลางทาง | ตรวจจับ disconnect → auto-reopen |
| EDC ไม่ตอบ ACK | Timeout 5 วินาที → resend สูงสุด 3 ครั้ง |
| Transaction ค้าง | Timeout 60 วินาที → cancel + แจ้ง error |
| ข้อมูลเสียหาย | Validate LRC checksum ก่อน parse response |
| สถานะไม่ชัด | Push status: `port-ready`, `waiting-response`, `timeout`, `port-disconnected` |

### Xray Uploader Module

**Port จาก:** `XrayUploader` (Electron app เดิม)

| Item | Value |
|------|-------|
| Library | `chokidar` v3 (คง v3 — v4 ตัด `awaitWriteFinish` ซึ่ง critical สำหรับ DICOM files ที่กำลังเขียน), `dicom-parser`, `sharp` v0.33 |
| หน้าที่ | Watch folder → parse DICOM → upload ไป backend API |
| ไม่ต่อ WebSocket | ทำงาน background อย่างเดียว, ส่งสถานะไป dashboard ผ่าน Electron IPC |
| Config | Watch folder path, API endpoint, credentials |
| Auth | ใช้ Electron `safeStorage` API แทน `keytar` (deprecated) สำหรับเก็บ credentials |

Logic ย้ายจาก XrayUploader ได้ตรงๆ — เป็น Electron/Node.js เหมือนกัน

## Electron Dashboard (Renderer)

UI เล็กๆ สำหรับแสดงสถานะและตั้งค่า ใช้ plain HTML/JS (ไม่ต้อง framework — UI ไม่ซับซ้อน):

รับข้อมูลจาก main process ผ่าน Electron IPC (`ipcRenderer.on`)

```
┌─────────────────────────────────┐
│  DentCloud Hardware Bridge      │
│                                 │
│  ● Card Reader    Connected     │
│  ● EDC (COM3)     Ready         │
│  ● Xray Watcher   Watching      │
│  ● WebSocket      1 client      │
│                                 │
│  Recent:                        │
│  14:32 บัตรอ่านสำเร็จ 1-xxxx-xx│
│  14:30 EDC payment approved     │
│  14:28 Xray uploaded: img01.dcm │
└─────────────────────────────────┘
```

**Features:**
- แสดงสถานะ realtime: Card Reader, EDC, Xray, WebSocket
- ตั้งค่า: COM port, baud rate, watch folder path, API credentials
- Log: recent events
- System tray: minimize ลง tray ได้
- Notification ถ้า device หลุด

## Configuration & Logging

### Config Storage

ใช้ `electron-store` เก็บ settings ที่ `app.getPath('userData')/config.json`:

```json
{
  "edc": {
    "comPort": "COM3",
    "baudRate": 9600,
    "dataBits": 8,
    "stopBits": 1
  },
  "xray": {
    "watchFolder": "C:\\DICOM",
    "apiEndpoint": "https://api.dentcloud.app",
    "autoStart": true
  },
  "ws": {
    "port": 9900
  },
  "app": {
    "startMinimized": false,
    "launchAtStartup": true
  }
}
```

### Credentials

ใช้ Electron `safeStorage` API สำหรับเก็บ API tokens (แทน `keytar` ที่ deprecated)

### Logging

- ใช้ file-based logging เก็บที่ `app.getPath('userData')/logs/`
- Log rotation: เก็บ 7 วัน, max 10MB per file
- แยก log per module: `card-reader.log`, `edc.log`, `xray.log`, `app.log`
- Transaction log สำหรับ EDC: `edc-transactions.log` (เก็บทุก transaction สำหรับ audit)

## Technology Stack

| Component | Library | Version | เหตุผล |
|-----------|---------|---------|--------|
| Runtime | Electron | 34 | Latest stable, Node 20, Chromium 132 |
| Card Reader | `smartcard` | latest | คง lib เดิม — มี APDU + ATR config พร้อม, เสี่ยงน้อย |
| Serial Port | `serialport` | 12 | มาตรฐาน Node.js serial |
| File Watcher | `chokidar` | 3 | ต้องใช้ `awaitWriteFinish` สำหรับ DICOM |
| DICOM Parser | `dicom-parser` | 1.8 | เบา, เพียงพอสำหรับ parse metadata |
| Image Processing | `sharp` | 0.33 | รองรับ Node 18+ |
| WebSocket Server | `ws` | 8 | เบา เสถียร มาตรฐาน |
| Thai Encoding | `legacy-encoding` | latest | อ่าน text ภาษาไทยจากบัตร |
| Photo Conversion | `hex2imagebase64` | latest | แปลง hex photo จากบัตรเป็น base64 JPEG |
| Config | `electron-store` | latest | เก็บ settings ใน JSON |
| Build | `electron-builder` | latest | Cross-platform packaging |
| Native rebuild | `electron-rebuild` | latest | Rebuild native modules (`smartcard`, `serialport`, `sharp`) |

## Frontend Changes

แก้ไขใน Vue 2 frontend:
- `SmartCard.vue`: เปลี่ยน WS URL จาก `ws://localhost:8088` → `ws://localhost:9900`, ปรับให้ส่ง `{ type: "card-reader", action: "read" }` แทน raw `"READ"` string, response field names คงเดิม (`personal.Citizenid` etc.)
- `SmartCardMOI.vue`: เช็คและปรับเช่นเดียวกัน
- `DcPaymentWebsocket.vue`: เปลี่ยน WS URL จาก `ws://localhost:5000/ws/` → `ws://localhost:9900`, ปรับให้ส่ง `{ type: "edc", ... }`, response format คงเดิม (`AcknowledgeDateTime`, `PresentationHeader`, `FieldDatas`)
- ทั้ง 2 component ต่อ WS แยกกันได้ (server รองรับ multiple clients)

## Target Platforms

| Platform | Priority | Build | หมายเหตุ |
|----------|----------|-------|---------|
| Windows x64 | หลัก | NSIS installer | ครบทุก module |
| macOS (ARM64 + x64) | รอง | DMG | EDC อาจใช้ไม่ได้ (hardware เป็น Windows-only), Card Reader + Xray ใช้ได้ |

## App Lifecycle

- **Single instance lock**: ใช้ `app.requestSingleInstanceLock()` ป้องกันเปิดซ้ำ
- **Port conflict detection**: ตรวจ port 9900 ก่อนเปิด WS server → แจ้ง error ถ้าชน
- **Launch at startup**: optional ผ่าน settings (ใช้ `app.setLoginItemSettings()`)
- **Auto-update**: ใช้ `electron-updater` + GitHub Releases สำหรับ update อัตโนมัติ
- **Concurrency**: Card Reader, EDC, Xray ทำงานอิสระ non-blocking กัน (แต่ละ module มี event loop แยก)

## Migration Path (สำหรับคลินิกที่ใช้ app เดิม)

1. ติดตั้ง DentCloud Hardware Bridge
2. Uninstall app เดิม 3 ตัว (Card Reader, EDC Interface, Xray Uploader)
3. ตั้งค่า COM port, watch folder ใน dashboard (ค่า default ตรงกับ app เดิม)
4. Frontend ต้อง deploy version ใหม่ที่ชี้ WS ไป port 9900

## Out of Scope

- ไม่รวม Vue 2 frontend ใน Electron
- ไม่ upgrade Vue 2 → Vue 3 ในรอบนี้
- ไม่รวม backend (dent-cloud-service) — ยังอยู่บน cloud
