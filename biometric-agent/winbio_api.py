"""Windows Biometric Framework (WinBio) ctypes wrapper for SecuGen HU20-AP."""
import ctypes
import ctypes.wintypes as wt
from ctypes import (
    c_uint64, c_size_t, c_uint8, c_ubyte, c_wchar,
    POINTER, byref, Structure, Union
)

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────
WINBIO_TYPE_FINGERPRINT = 0x00000008

WINBIO_POOL_SYSTEM  = 0x00000001
WINBIO_POOL_PRIVATE = 0x00000002

WINBIO_FLAG_DEFAULT  = 0x00000000
WINBIO_FLAG_BASIC    = 0x00000001
WINBIO_FLAG_ADVANCED = 0x00000002

WINBIO_PURPOSE_ENROLL                    = 0x01
WINBIO_PURPOSE_VERIFY                    = 0x02
WINBIO_PURPOSE_IDENTIFY                  = 0x04
WINBIO_PURPOSE_ENROLL_FOR_VERIFICATION   = 0x10
WINBIO_PURPOSE_ENROLL_FOR_IDENTIFICATION = 0x20
WINBIO_PURPOSE_AUDIT                     = 0x40

WINBIO_BIR_DATA_FLAG_RAW          = 0x01
WINBIO_BIR_DATA_FLAG_INTERMEDIATE = 0x02
WINBIO_BIR_DATA_FLAG_PROCESSED    = 0x04

WINBIO_SUBTYPE_NO_INFORMATION = 0x00
WINBIO_SUBTYPE_ANY            = 0xFF

# Finger positions
WINBIO_ANSI_381_POS_UNKNOWN            = 0
WINBIO_ANSI_381_POS_RH_THUMB           = 1
WINBIO_ANSI_381_POS_RH_INDEX_FINGER    = 2
WINBIO_ANSI_381_POS_RH_MIDDLE_FINGER   = 3
WINBIO_ANSI_381_POS_RH_RING_FINGER     = 4
WINBIO_ANSI_381_POS_RH_LITTLE_FINGER   = 5
WINBIO_ANSI_381_POS_LH_THUMB           = 6
WINBIO_ANSI_381_POS_LH_INDEX_FINGER    = 7
WINBIO_ANSI_381_POS_LH_MIDDLE_FINGER   = 8
WINBIO_ANSI_381_POS_LH_RING_FINGER     = 9
WINBIO_ANSI_381_POS_LH_LITTLE_FINGER   = 10

FINGER_NAMES = {
    WINBIO_ANSI_381_POS_UNKNOWN:           "Unknown",
    WINBIO_ANSI_381_POS_RH_THUMB:          "Right Thumb",
    WINBIO_ANSI_381_POS_RH_INDEX_FINGER:   "Right Index",
    WINBIO_ANSI_381_POS_RH_MIDDLE_FINGER:  "Right Middle",
    WINBIO_ANSI_381_POS_RH_RING_FINGER:    "Right Ring",
    WINBIO_ANSI_381_POS_RH_LITTLE_FINGER:  "Right Little",
    WINBIO_ANSI_381_POS_LH_THUMB:          "Left Thumb",
    WINBIO_ANSI_381_POS_LH_INDEX_FINGER:   "Left Index",
    WINBIO_ANSI_381_POS_LH_MIDDLE_FINGER:  "Left Middle",
    WINBIO_ANSI_381_POS_LH_RING_FINGER:    "Left Ring",
    WINBIO_ANSI_381_POS_LH_LITTLE_FINGER:  "Left Little",
}

FINGER_OPTIONS = list(FINGER_NAMES.items())  # [(pos, name), ...]

# Identity types
WINBIO_IDENTITY_TYPE_NULL     = 0
WINBIO_IDENTITY_TYPE_WILDCARD = 1
WINBIO_IDENTITY_TYPE_GUID     = 2
WINBIO_IDENTITY_TYPE_SID      = 3

WINBIO_MAX_STRING_LEN  = 256
SECURITY_MAX_SID_SIZE  = 68

# HRESULT codes
S_OK                           = 0x00000000
WINBIO_I_MORE_DATA             = 0x00090001
WINBIO_E_NO_MATCH              = 0x80098001
WINBIO_E_BAD_CAPTURE           = 0x80098002
WINBIO_E_ENROLLMENT_IN_PROGRESS = 0x80098008
WINBIO_E_CANCELED              = 0x80098009
WINBIO_E_DATABASE_NO_RESULTS   = 0x80098015
WINBIO_E_DEVICE_FAILURE        = 0x80098020
WINBIO_E_SENSOR_UNAVAILABLE    = 0x8009800E
E_ACCESSDENIED                 = 0x80070005

WINBIO_E_UNKNOWN_ID            = 0x80098007

_ERROR_STRINGS = {
    WINBIO_E_NO_MATCH:              "No biometric match found",
    WINBIO_E_UNKNOWN_ID:            "Finger not enrolled — please enroll this person first",
    WINBIO_E_BAD_CAPTURE:           "Poor quality capture — try again",
    WINBIO_E_ENROLLMENT_IN_PROGRESS:"Enrollment already in progress",
    WINBIO_E_CANCELED:              "Operation was canceled",
    WINBIO_E_DATABASE_NO_RESULTS:   "No results found in database",
    WINBIO_E_DEVICE_FAILURE:        "Device failure",
    WINBIO_E_SENSOR_UNAVAILABLE:    "Sensor unavailable — check USB connection",
    E_ACCESSDENIED:                 "Access denied — try running as Administrator",
}

# ──────────────────────────────────────────────────────────────────────────────
# Structures
# ──────────────────────────────────────────────────────────────────────────────
class GUID(Structure):
    _fields_ = [
        ("Data1", wt.DWORD),
        ("Data2", wt.WORD),
        ("Data3", wt.WORD),
        ("Data4", c_ubyte * 8),
    ]

    def __str__(self):
        d4 = self.Data4
        tail = "".join(f"{b:02X}" for b in d4[2:])
        return (
            f"{{{self.Data1:08X}-{self.Data2:04X}-{self.Data3:04X}-"
            f"{d4[0]:02X}{d4[1]:02X}-{tail}}}"
        )

    def __eq__(self, other):
        if isinstance(other, GUID):
            return str(self) == str(other)
        return NotImplemented

    def __hash__(self):
        return hash(str(self))


class _SID_Value(Structure):
    _fields_ = [
        ("Size", wt.ULONG),
        ("Data", c_ubyte * SECURITY_MAX_SID_SIZE),
    ]


class _Identity_Value(Union):
    _fields_ = [
        ("Null",        wt.ULONG),
        ("Wildcard",    wt.ULONG),
        ("TemplateGuid", GUID),
        ("AccountSid",  _SID_Value),
    ]


class WINBIO_IDENTITY(Structure):
    _fields_ = [
        ("Type",  wt.ULONG),
        ("Value", _Identity_Value),
    ]

    def guid_str(self):
        if self.Type == WINBIO_IDENTITY_TYPE_GUID:
            return str(self.Value.TemplateGuid)
        return None


class WINBIO_VERSION(Structure):
    _fields_ = [
        ("MajorVersion", wt.DWORD),
        ("MinorVersion", wt.DWORD),
    ]


class WINBIO_BIR_DATA(Structure):
    _fields_ = [
        ("Size",   wt.ULONG),
        ("Offset", wt.ULONG),
    ]


class WINBIO_BIR(Structure):
    _fields_ = [
        ("HeaderBlock",      WINBIO_BIR_DATA),
        ("StandardDataBlock", WINBIO_BIR_DATA),
        ("VendorDataBlock",  WINBIO_BIR_DATA),
        ("SignatureBlock",   WINBIO_BIR_DATA),
    ]


class WINBIO_UNIT_SCHEMA(Structure):
    _fields_ = [
        ("UnitId",           wt.ULONG),
        ("PoolType",         wt.ULONG),
        ("BiometricFactor",  wt.ULONG),
        ("SensorSubType",    wt.ULONG),
        ("Capabilities",     wt.ULONG),
        ("DeviceInstanceId", c_wchar * WINBIO_MAX_STRING_LEN),
        ("Description",      c_wchar * WINBIO_MAX_STRING_LEN),
        ("Manufacturer",     c_wchar * WINBIO_MAX_STRING_LEN),
        ("Model",            c_wchar * WINBIO_MAX_STRING_LEN),
        ("SerialNumber",     c_wchar * WINBIO_MAX_STRING_LEN),
        ("FirmwareVersion",  WINBIO_VERSION),
    ]

# ──────────────────────────────────────────────────────────────────────────────
# Exception
# ──────────────────────────────────────────────────────────────────────────────
class WinBioError(Exception):
    def __init__(self, hr: int, ctx: str = ""):
        self.hr = hr & 0xFFFFFFFF
        msg = _ERROR_STRINGS.get(self.hr, f"HRESULT 0x{self.hr:08X}")
        prefix = f"{ctx}: " if ctx else ""
        super().__init__(f"{prefix}{msg}")


def _chk(hr: int, ctx: str = ""):
    masked = hr & 0xFFFFFFFF
    if masked != S_OK and masked != WINBIO_I_MORE_DATA:
        raise WinBioError(masked, ctx)
    return masked

# ──────────────────────────────────────────────────────────────────────────────
# WinBio wrapper
# ──────────────────────────────────────────────────────────────────────────────
class WinBio:
    """High-level wrapper around Windows Biometric Framework."""

    _dll = None

    @classmethod
    def _load_dll(cls):
        if cls._dll is None:
            cls._dll = ctypes.WinDLL("winbio.dll")
        return cls._dll

    def __init__(self):
        self._lib = self._load_dll()
        self._session: int = 0

    # ── Device enumeration ────────────────────────────────────────────────────

    def enum_units(self) -> list:
        """Return list of WINBIO_UNIT_SCHEMA dicts for all fingerprint units."""
        ptr = POINTER(WINBIO_UNIT_SCHEMA)()
        count = c_size_t(0)
        _chk(
            self._lib.WinBioEnumBiometricUnits(
                WINBIO_TYPE_FINGERPRINT, byref(ptr), byref(count)
            ),
            "WinBioEnumBiometricUnits",
        )
        units = []
        for i in range(count.value):
            u = ptr[i]
            units.append({
                "unit_id":     u.UnitId,
                "pool_type":   u.PoolType,
                "description": u.Description,
                "manufacturer": u.Manufacturer,
                "model":       u.Model,
                "serial":      u.SerialNumber,
                "firmware":    f"{u.FirmwareVersion.MajorVersion}.{u.FirmwareVersion.MinorVersion}",
                "capabilities": u.Capabilities,
                "instance_id": u.DeviceInstanceId,
            })
        if count.value:
            self._lib.WinBioFree(ptr)
        return units

    # ── Session management ────────────────────────────────────────────────────

    def open_session(self, unit_ids: list = None) -> int:
        """Open a system-pool biometric session. Returns the session handle.

        Note: WINBIO_POOL_SYSTEM requires UnitArray=NULL — unit_ids are ignored.
        """
        handle = c_uint64(0)
        _chk(
            self._lib.WinBioOpenSession(
                WINBIO_TYPE_FINGERPRINT,
                WINBIO_POOL_SYSTEM,
                WINBIO_FLAG_DEFAULT,
                None, c_size_t(0), None,
                byref(handle),
            ),
            "WinBioOpenSession",
        )
        self._session = handle.value
        return self._session

    def close_session(self):
        if self._session:
            self._lib.WinBioCloseSession(self._session)
            self._session = 0

    @property
    def is_open(self) -> bool:
        return self._session != 0

    # ── Sensor location ───────────────────────────────────────────────────────

    def locate_sensor(self) -> int:
        """Block until user touches sensor. Returns unit_id."""
        self._require_session()
        uid = wt.ULONG(0)
        _chk(self._lib.WinBioLocateSensor(self._session, byref(uid)), "WinBioLocateSensor")
        return uid.value

    # ── Enrollment ────────────────────────────────────────────────────────────

    def enroll_begin(self, sub_factor: int, unit_id: int):
        self._require_session()
        _chk(
            self._lib.WinBioEnrollBegin(
                self._session, c_uint8(sub_factor), wt.ULONG(unit_id)
            ),
            "WinBioEnrollBegin",
        )

    def enroll_capture(self) -> tuple:
        """Capture one enrollment swipe. Returns (reject_detail, needs_more_swipes)."""
        self._require_session()
        reject = wt.ULONG(0)
        hr = self._lib.WinBioEnrollCapture(self._session, byref(reject))
        masked = hr & 0xFFFFFFFF
        if masked not in (S_OK, WINBIO_I_MORE_DATA):
            raise WinBioError(masked, "WinBioEnrollCapture")
        return reject.value, (masked == WINBIO_I_MORE_DATA)

    def enroll_commit(self) -> tuple:
        """Commit enrollment. Returns (WINBIO_IDENTITY, is_new_template)."""
        self._require_session()
        identity = WINBIO_IDENTITY()
        is_new = ctypes.c_bool(False)
        _chk(
            self._lib.WinBioEnrollCommit(self._session, byref(identity), byref(is_new)),
            "WinBioEnrollCommit",
        )
        return identity, is_new.value

    def enroll_discard(self):
        if self._session:
            self._lib.WinBioEnrollDiscard(self._session)

    # ── Identification ────────────────────────────────────────────────────────

    def identify(self) -> tuple:
        """Block until finger placed and matched.
        Returns (unit_id, WINBIO_IDENTITY, sub_factor, reject_detail)."""
        self._require_session()
        uid      = wt.ULONG(0)
        identity = WINBIO_IDENTITY()
        sub      = c_uint8(0)
        reject   = wt.ULONG(0)
        _chk(
            self._lib.WinBioIdentify(
                self._session, byref(uid), byref(identity), byref(sub), byref(reject)
            ),
            "WinBioIdentify",
        )
        return uid.value, identity, sub.value, reject.value

    # ── Verification ─────────────────────────────────────────────────────────

    def verify(self, identity: WINBIO_IDENTITY, sub_factor: int) -> tuple:
        """Verify finger against a specific identity.
        Returns (unit_id, matched, reject_detail)."""
        self._require_session()
        uid    = wt.ULONG(0)
        match  = ctypes.c_bool(False)
        reject = wt.ULONG(0)
        _chk(
            self._lib.WinBioVerify(
                self._session, byref(identity), c_uint8(sub_factor),
                byref(uid), byref(match), byref(reject),
            ),
            "WinBioVerify",
        )
        return uid.value, match.value, reject.value

    # ── Raw sample capture ────────────────────────────────────────────────────

    def capture_sample(
        self,
        purpose: int = WINBIO_PURPOSE_ENROLL,
        flags: int = WINBIO_BIR_DATA_FLAG_RAW,
    ) -> tuple:
        """Capture a raw biometric sample (BIR bytes).
        Returns (unit_id, raw_bytes, reject_detail).
        Requires WINBIO_FLAG_ADVANCED session or admin rights."""
        self._require_session()
        uid     = wt.ULONG(0)
        sample  = ctypes.c_void_p(0)
        size    = c_size_t(0)
        reject  = wt.ULONG(0)
        _chk(
            self._lib.WinBioCaptureSample(
                self._session,
                c_uint8(purpose),
                c_uint8(flags),
                byref(uid),
                byref(sample),
                byref(size),
                byref(reject),
            ),
            "WinBioCaptureSample",
        )
        raw = bytes(ctypes.string_at(sample, size.value)) if sample.value else b""
        self._lib.WinBioFree(sample)
        return uid.value, raw, reject.value

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close_session()

    # ── Internal ──────────────────────────────────────────────────────────────

    def _require_session(self):
        if not self._session:
            raise RuntimeError("No open session — call open_session() first")
