/// Model profil pengguna Smartsa LMS hasil sinkronisasi `/api/bootstrap`.
class UserProfile {
  const UserProfile({
    required this.uid,
    required this.email,
    required this.name,
    required this.displayName,
    required this.role,
    required this.accountType,
    required this.isInstitutional,
    required this.emailVerified,
    required this.institution,
    required this.nim,
    required this.nidn,
    required this.nip,
    required this.mfaEnabled,
    required this.mfaRequired,
    this.photoUrl,
  });

  final String uid;
  final String email;
  final String name;
  final String displayName;
  final String? photoUrl;
  final String role;
  final String accountType;
  final bool isInstitutional;
  final bool emailVerified;
  final String institution;
  final String nim;
  final String nidn;
  final String nip;
  final bool mfaEnabled;
  final bool mfaRequired;

  bool get isAdmin => role == 'admin';
  bool get isLecturer => role == 'lecturer';
  bool get isStudent => !isAdmin && !isLecturer;

  String get effectiveName {
    if (displayName.trim().isNotEmpty) return displayName.trim();
    if (name.trim().isNotEmpty) return name.trim();
    if (email.contains('@')) return email.split('@').first;
    return 'Pengguna Smartsa';
  }

  String get roleLabel {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'lecturer':
        return 'Dosen';
      default:
        return 'Mahasiswa';
    }
  }

  String get accountTypeLabel {
    switch (accountType) {
      case 'DOSEN':
        return 'Institusional (Dosen)';
      case 'MAHASISWA':
        return 'Institusional (Mahasiswa)';
      default:
        return isInstitutional ? 'Institusional' : 'Umum';
    }
  }

  String get academicIdLabel {
    if (isAdmin) return 'NIP / ID Admin';
    if (isLecturer) return 'NIDN / ID Dosen';
    return 'NIM';
  }

  String get academicIdValue {
    if (isAdmin) return nip.isNotEmpty ? nip : nim;
    if (isLecturer) return nidn.isNotEmpty ? nidn : nim;
    return nim;
  }

  factory UserProfile.fromJson(
    Map<String, dynamic> json, {
    bool? mfaEnabledOverride,
    bool? mfaRequiredOverride,
  }) {
    final roleVal = (json['role'] ?? 'student').toString().trim().toLowerCase();
    final normalizedRole =
        (roleVal == 'admin' || roleVal == 'lecturer') ? roleVal : 'student';

    return UserProfile(
      uid: (json['uid'] ?? '').toString().trim(),
      email: (json['email'] ?? '').toString().trim(),
      name: (json['name'] ?? '').toString().trim(),
      displayName: (json['displayName'] ?? json['name'] ?? '').toString().trim(),
      photoUrl: _parseNullableString(json['photoURL']),
      role: normalizedRole,
      accountType: (json['accountType'] ?? 'UMUM').toString().trim().toUpperCase(),
      isInstitutional: json['isInstitutional'] == true,
      emailVerified: json['emailVerified'] == true,
      institution: (json['institution'] ?? 'Universitas Negeri Surabaya')
          .toString()
          .trim(),
      nim: (json['nim'] ?? '').toString().trim(),
      nidn: (json['nidn'] ?? '').toString().trim(),
      nip: (json['nip'] ?? '').toString().trim(),
      mfaEnabled: mfaEnabledOverride ?? (json['mfaEnabled'] == true),
      mfaRequired: mfaRequiredOverride ?? (json['mfaRequired'] == true),
    );
  }

  UserProfile copyWith({
    bool? mfaEnabled,
    bool? mfaRequired,
    bool? emailVerified,
  }) {
    return UserProfile(
      uid: uid,
      email: email,
      name: name,
      displayName: displayName,
      photoUrl: photoUrl,
      role: role,
      accountType: accountType,
      isInstitutional: isInstitutional,
      emailVerified: emailVerified ?? this.emailVerified,
      institution: institution,
      nim: nim,
      nidn: nidn,
      nip: nip,
      mfaEnabled: mfaEnabled ?? this.mfaEnabled,
      mfaRequired: mfaRequired ?? this.mfaRequired,
    );
  }

  static String? _parseNullableString(dynamic value) {
    if (value == null) return null;
    final str = value.toString().trim();
    return str.isEmpty ? null : str;
  }
}
