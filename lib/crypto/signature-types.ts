export interface SignerField {
  id: string;
  key: string;
  label: string;
  value: string;
  enabled: boolean;
  isCustom?: boolean;
}

export interface PartyConfig {
  roleName: string; // e.g. "甲", "乙"
  roleDescription: string; // e.g. "作成者 / 開示者", "署名者 / 受領者"
  fields: SignerField[];
}

export type SignaturePlacement = 'inline_margin' | 'new_page';

export interface SignatureFusionConfig {
  enabled: boolean;
  placement: SignaturePlacement;
  inlineMarginOffset: number; // 0 (bottom) to 100 pt
  agreementDateType: 'auto_on_sign' | 'custom';
  customAgreementDate?: string;
  leadText?: string;
  parties: PartyConfig[];
}

export function getDefaultPartyFields(role: 'partyA' | 'partyB'): SignerField[] {
  if (role === 'partyA') {
    return [
      { id: 'a-company', key: 'company', label: '法人名 / 屋号 / 所属', value: '', enabled: true },
      { id: 'a-title', key: 'title', label: '役職 / 肩書', value: '', enabled: true },
      { id: 'a-name', key: 'name', label: '氏名', value: '', enabled: true },
      { id: 'a-address', key: 'address', label: '所在地 / 住所', value: '', enabled: true },
      { id: 'a-phone', key: 'phone', label: '電話番号', value: '', enabled: false },
    ];
  } else {
    return [
      { id: 'b-company', key: 'company', label: '法人名 / 屋号 / 所属', value: '', enabled: false },
      { id: 'b-title', key: 'title', label: '役職 / 肩書', value: '', enabled: false },
      { id: 'b-name', key: 'name', label: '氏名', value: '', enabled: true },
      { id: 'b-address', key: 'address', label: '所在地 / 住所', value: '', enabled: true },
      { id: 'b-phone', key: 'phone', label: '電話番号', value: '', enabled: false },
    ];
  }
}
