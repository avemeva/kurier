# Telegram Desktop tdata Decryption & Auth Key Extraction

## Overview

Telegram Desktop stores session data in `tdata/` directories. Each session contains encrypted auth keys that authenticate a user without phone number + SMS code. This document covers the full decryption process and options for reusing these sessions with TDLib.

## tdata Directory Structure

```
tdata/
  key_datas              # local encryption key (encrypted with passcode)
  D877F783D5D3EF8C/      # MD5-derived folder name for "data" account
    maps                 # account map file (encrypted with local key)
  D877F783D5D3EF8Cs      # session auth data (encrypted with local key)
```

The folder name `D877F783D5D3EF8C` is `md5("data")` with nibble-reversed bytes. Multi-account setups use `data#2`, `data#3`, etc.

## TDF File Format

Every tdata file uses the TDF container format:

| Offset | Size | Field |
|--------|------|-------|
| 0 | 4 | Magic: `TDF$` (0x54 0x44 0x46 0x24) |
| 4 | 4 | Version (uint32 LE) |
| 8 | N-16 | Payload data |
| N-16 | 16 | MD5 checksum |

MD5 is computed over: `payload + len(payload) [4 bytes LE] + version [4 bytes LE] + "TDF$"`.

Files are tried with suffixes `s`, `1`, `0` (e.g., `key_datas`, `key_data1`, `key_data0`).

## Qt Serialization

All payloads use Qt `QDataStream` (v5.1):
- **Integers**: big-endian
- **QByteArray**: int32 length prefix (BE) + raw bytes. `0xFFFFFFFF` = null/empty.

## Decryption Flow

### Step 1: Read `key_datas`

The TDF payload contains 3 QByteArrays:

1. **salt** (32 bytes)
2. **key_encrypted** (local key, encrypted)
3. **info_encrypted** (account index list, encrypted)

### Step 2: Derive passcode key

```typescript
function createLocalKey(salt: Uint8Array, passcode: Uint8Array): Uint8Array {
  // SHA-512(salt + passcode + salt)
  const hash = sha512(concat(salt, passcode, salt));

  // PBKDF2-HMAC-SHA512
  // iterations = 1 when no passcode (common case), 100000 with passcode
  const iterations = passcode.length === 0 ? 1 : 100000;

  return pbkdf2_hmac_sha512(hash, salt, iterations, 256); // 256 bytes
}
```

When no local passcode is set (the default), this is `PBKDF2(SHA512(salt + salt), salt, 1 iteration, 256 bytes)`.

### Step 3: Decrypt the local key

Use the passcode key (256 bytes) to decrypt `key_encrypted` via AES-256-IGE (see below), yielding the 256-byte **local key**.

### Step 4: Decrypt account info

Use the local key to decrypt `info_encrypted`:
- `count` (int32) -- number of accounts
- `index[0..count-1]` (int32 each) -- account indices
- `active_index` (int32)

### Step 5: Decrypt the map file

Read TDF at `tdata/D877F783D5D3EF8C/maps`, decrypt with the local key. The decrypted data contains settings blocks:

```
[block_id: int32] [block_data...]
[block_id: int32] [block_data...]
...
```

### Step 6: Find MTP authorization (block ID 0x4B)

```typescript
function readMtpAuthorization(data: ByteStream) {
  const legacyUserId = readInt32(data);  // BE
  const legacyMainDcId = readInt32(data); // BE

  let userId: number, mainDcId: number;

  if (legacyUserId === -1 && legacyMainDcId === -1) {
    // New format (64-bit user IDs)
    userId = readUint64(data);
    mainDcId = readInt32(data);
  } else {
    userId = legacyUserId;
    mainDcId = legacyMainDcId;
  }

  // Auth keys per DC
  const keyCount = readInt32(data);
  const keys: Map<number, Uint8Array> = new Map();
  for (let i = 0; i < keyCount; i++) {
    const dcId = readInt32(data);
    const authKey = readBytes(data, 256); // raw 256 bytes, NOT length-prefixed
    keys.set(dcId, authKey);
  }

  return { userId, mainDcId, keys };
}
```

Each auth_key is 256 bytes (2048 bits). The `mainDcId` (1-5) indicates the home datacenter.

## AES-256-IGE Encryption

### Encrypted data format

| Offset | Size | Field |
|--------|------|-------|
| 0 | 16 | `msg_key` (first 16 bytes of SHA-1 of plaintext) |
| 16 | N | AES-256-IGE ciphertext (multiple of 16) |

### Decryption

```typescript
function decryptLocal(encrypted: Uint8Array, localKey: Uint8Array): Uint8Array {
  const msgKey = encrypted.slice(0, 16);
  const encryptedData = encrypted.slice(16);

  // Derive AES key + IV from localKey + msgKey
  const [aesKey, aesIv] = prepareAES_oldmtp(localKey, msgKey);

  // Decrypt with AES-256-IGE
  const decrypted = aes_ige_decrypt(encryptedData, aesKey, aesIv);

  // Verify: SHA-1(decrypted)[0:16] must equal msgKey
  const checkHash = sha1(decrypted).slice(0, 16);
  if (!bytesEqual(checkHash, msgKey)) {
    throw new Error("Bad decrypt key");
  }

  // First 4 bytes = actual data length (uint32 LE)
  const dataLen = readUint32LE(decrypted, 0);
  return decrypted.slice(4, 4 + dataLen);
}
```

### AES key/IV derivation (old MTProto style)

```typescript
function prepareAES_oldmtp(
  authKey: Uint8Array,  // 256 bytes
  msgKey: Uint8Array,   // 16 bytes
): [Uint8Array, Uint8Array] {
  const x = 8; // x=0 for send, x=8 for receive/local decrypt

  const sha1_a = sha1(concat(msgKey,             authKey.slice(x,    x + 32)));
  const sha1_b = sha1(concat(authKey.slice(x+32, x + 48), msgKey, authKey.slice(x+48, x+64)));
  const sha1_c = sha1(concat(authKey.slice(x+64, x + 96), msgKey));
  const sha1_d = sha1(concat(msgKey,             authKey.slice(x+96, x + 128)));

  const aesKey = concat(
    sha1_a.slice(0, 8),
    sha1_b.slice(8, 20),
    sha1_c.slice(4, 16)
  ); // 32 bytes

  const aesIv = concat(
    sha1_a.slice(8, 20),
    sha1_b.slice(0, 8),
    sha1_c.slice(16, 20),
    sha1_d.slice(0, 8)
  ); // 32 bytes

  return [aesKey, aesIv];
}
```

### AES-IGE implementation

AES-IGE is not in standard crypto libraries. Built from AES-ECB:

```typescript
function aes_ige_decrypt(
  ciphertext: Uint8Array,  // multiple of 16
  key: Uint8Array,         // 32 bytes
  iv: Uint8Array           // 32 bytes: iv1 (16) + iv2 (16)
): Uint8Array {
  let iv1 = iv.slice(0, 16);
  let iv2 = iv.slice(16, 32);
  const result = new Uint8Array(ciphertext.length);

  for (let i = 0; i < ciphertext.length; i += 16) {
    const block = ciphertext.slice(i, i + 16);
    const xored = xorBlocks(block, iv2);
    const decrypted = aes_ecb_decrypt(xored, key);
    const plain = xorBlocks(decrypted, iv1);
    result.set(plain, i);
    iv1 = block;
    iv2 = plain;
  }

  return result;
}
```

## Using Extracted Auth Keys

### TDLib limitations

TDLib **does not support importing auth_keys**. The developer has explicitly stated:
- "You can't transfer sessions between different implementations" ([#1684](https://github.com/tdlib/td/issues/1684))
- No session import/export API ([#3417](https://github.com/tdlib/td/issues/3417))

### Viable options

| Approach | Description |
|----------|-------------|
| **Telethon/Pyrogram** | Use `opentele` to convert tdata auth_key to Telethon `.session` or Pyrogram session string. These accept raw auth_key + dc_id. |
| **QR login** | From the extracted session (via Telethon), initiate QR login to authorize a new TDLib instance as a second device. |
| **Copy TDLib database** | If you have one working TDLib session, copy its entire `database_directory` to reuse it. |

### Recommended flow for TDLib test accounts

```
tdata → decrypt → auth_key + dc_id
  → opentele → Telethon session
    → QR-authorize a TDLib instance
```

## Sample zip analysis

`Telegram_7643678451_tdata.zip` contains 10 accounts:

| Phone | tdata files |
|-------|-------------|
| +79251153942 | key_datas (388B), D877F783D5D3EF8Cs (348B), maps (68B) |
| +79251466710 | same structure |
| +79251767741 | same structure |
| +79254115943 | same structure |
| +79254117889 | same structure |
| +79254129987 | same structure |
| +79254130005 | same structure |
| +79269700532 | same structure |
| +79273880523 | same structure |
| +79808202876 | same structure |

Key observations:
- All `key_datas` files are **byte-identical** (same local encryption key) -- generated by the same tool/instance
- All `maps` files are **byte-identical** (empty/default) -- no cached chat data
- `D877F783D5D3EF8Cs` files are **unique per account** -- contain the actual encrypted auth keys
- Minimal tdata: session-only exports, no history/media/settings

## References

- [ntqbit/tdesktop-decrypter](https://github.com/ntqbit/tdesktop-decrypter) -- clean Python implementation
- [thedemons/opentele](https://github.com/thedemons/opentele) -- tdata-to-Telethon/Pyrogram converter
- [atilaromero/telegram-desktop-decrypt](https://github.com/atilaromero/telegram-desktop-decrypt) -- Go implementation
- [nazar220160/TGConvertor](https://github.com/nazar220160/TGConvertor) -- multi-format session converter
- [TDLib AuthKey.h](https://github.com/tdlib/td/blob/master/td/mtproto/AuthKey.h)
- [TDLib Issue #1684](https://github.com/tdlib/td/issues/1684)
- [Telegram Desktop localstorage.cpp](https://github.com/telegramdesktop/tdesktop/blob/979db978595e6e9c3cf3aec77b790bafd8836efe/Telegram/SourceFiles/storage/localstorage.cpp)
