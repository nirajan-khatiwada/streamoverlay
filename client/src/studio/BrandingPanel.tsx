import React, { useState } from 'react';
import type { StudioConfig } from '@shared/types';

interface BrandingPanelProps {
  config: StudioConfig;
  onPatchConfig: (patch: Partial<StudioConfig>) => Promise<void>;
}

async function uploadImageAsset(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/uploads/image', { method: 'POST', body: formData });
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(body.error || 'Image upload failed');
  }
  return body.url;
}

export const BrandingPanel: React.FC<BrandingPanelProps> = ({ config, onPatchConfig }) => {
  const [uploadStatus, setUploadStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const handleUpload = async (
    slot: 'vs' | 'brand' | 'promo',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingSlot(slot);
    setUploadStatus(null);
    try {
      const url = await uploadImageAsset(file);
      if (slot === 'vs') {
        await onPatchConfig({
          vsBanner: { ...config.vsBanner, mode: 'custom-image', customImageUrl: url },
        });
      } else if (slot === 'brand') {
        await onPatchConfig({
          brandBlock: { ...config.brandBlock, mode: 'custom-image', customImageUrl: url },
        });
      } else {
        await onPatchConfig({
          stingerPromo: { ...config.stingerPromo, enabled: true, customImageUrl: url },
        });
      }
      setUploadStatus({ kind: 'ok', text: `Uploaded ${file.name} and updated OBS overlay live.` });
    } catch (err) {
      setUploadStatus({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Upload failed.',
      });
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <div className="form-stack">
      {uploadStatus ? (
        <div
          role={uploadStatus.kind === 'error' ? 'alert' : 'status'}
          className={`status-banner ${uploadStatus.kind === 'error' ? 'status-banner--error' : 'status-banner--ok'}`}
        >
          {uploadStatus.text}
        </div>
      ) : null}

      {/* 1. Center VS Banner */}
      <fieldset className="field-fieldset">
        <legend>Center Matchup VS Graphic (Middle Row)</legend>
        <div className="radio-inline">
          <label className="check-row">
            <input
              type="radio"
              name="vsBannerMode"
              checked={config.vsBanner.mode === 'auto-captains'}
              onChange={() =>
                void onPatchConfig({ vsBanner: { ...config.vsBanner, mode: 'auto-captains' } })
              }
            />
            <span>Auto-Pull Match Captains from Crex</span>
          </label>
          <label className="check-row">
            <input
              type="radio"
              name="vsBannerMode"
              checked={config.vsBanner.mode === 'custom-image'}
              onChange={() =>
                void onPatchConfig({ vsBanner: { ...config.vsBanner, mode: 'custom-image' } })
              }
            />
            <span>Custom Uploaded VS Graphic</span>
          </label>
        </div>

        <div className="field">
          <label htmlFor="vs-upload">Upload Custom VS Banner (PNG / JPG / WebP, max 5 MB)</label>
          <input
            id="vs-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void handleUpload('vs', e)}
            disabled={uploadingSlot === 'vs'}
          />
        </div>

        {config.vsBanner.customImageUrl ? (
          <div className="upload-preview-box">
            <img
              src={config.vsBanner.customImageUrl}
              alt="Custom VS banner preview"
              className="upload-thumb"
              width={112}
              height={46}
            />
            <span className="field-hint" style={{ flex: 1 }}>
              Custom VS image stored locally.
            </span>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() =>
                void onPatchConfig({
                  vsBanner: { ...config.vsBanner, mode: 'auto-captains', customImageUrl: null },
                })
              }
            >
              Remove
            </button>
          </div>
        ) : null}
      </fieldset>

      {/* 2. Channel Brand Block (Row 3 Right) */}
      <fieldset className="field-fieldset">
        <legend>Channel Brand Block (Overs Row Far Right)</legend>
        <div className="radio-inline">
          <label className="check-row">
            <input
              type="radio"
              name="brandMode"
              checked={config.brandBlock.mode === 'text'}
              onChange={() =>
                void onPatchConfig({ brandBlock: { ...config.brandBlock, mode: 'text' } })
              }
            />
            <span>Text + Monogram Badge</span>
          </label>
          <label className="check-row">
            <input
              type="radio"
              name="brandMode"
              checked={config.brandBlock.mode === 'custom-image'}
              onChange={() =>
                void onPatchConfig({ brandBlock: { ...config.brandBlock, mode: 'custom-image' } })
              }
            />
            <span>Custom Logo Image</span>
          </label>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="brand-monogram">Monogram (e.g. CS)</label>
            <input
              id="brand-monogram"
              type="text"
              maxLength={8}
              value={config.brandBlock.monogram}
              onChange={(e) =>
                void onPatchConfig({
                  brandBlock: { ...config.brandBlock, monogram: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="brand-color">Block Background Color</label>
            <input
              id="brand-color"
              type="color"
              value={config.brandBlock.bgColor}
              onChange={(e) =>
                void onPatchConfig({
                  brandBlock: { ...config.brandBlock, bgColor: e.target.value },
                })
              }
            />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="brand-line1">Title Line 1</label>
            <input
              id="brand-line1"
              type="text"
              maxLength={30}
              value={config.brandBlock.titleLine1}
              onChange={(e) =>
                void onPatchConfig({
                  brandBlock: { ...config.brandBlock, titleLine1: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="brand-line2">Title Line 2</label>
            <input
              id="brand-line2"
              type="text"
              maxLength={30}
              value={config.brandBlock.titleLine2}
              onChange={(e) =>
                void onPatchConfig({
                  brandBlock: { ...config.brandBlock, titleLine2: e.target.value },
                })
              }
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="brand-upload">Upload Channel Brand Image (412×76px recommended)</label>
          <input
            id="brand-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void handleUpload('brand', e)}
            disabled={uploadingSlot === 'brand'}
          />
        </div>

        {config.brandBlock.customImageUrl ? (
          <div className="upload-preview-box">
            <img
              src={config.brandBlock.customImageUrl}
              alt="Channel brand preview"
              className="upload-thumb"
              width={112}
              height={46}
            />
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() =>
                void onPatchConfig({
                  brandBlock: { ...config.brandBlock, mode: 'text', customImageUrl: null },
                })
              }
            >
              Remove
            </button>
          </div>
        ) : null}
      </fieldset>

      {/* 3. Full-Screen Stinger Promo Strip */}
      <fieldset className="field-fieldset">
        <legend>Full-Screen Stinger Bottom Promo Strip (FOUR / SIX / WICKET)</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.stingerPromo.enabled}
            onChange={(e) =>
              void onPatchConfig({
                stingerPromo: { ...config.stingerPromo, enabled: e.target.checked },
              })
            }
          />
          <span>Show bottom channel promo banner during FOUR / SIX / WICKET stingers</span>
        </label>

        <div className="form-row">
          <div className="field">
            <label htmlFor="promo-brand">Promo Brand Label</label>
            <input
              id="promo-brand"
              type="text"
              maxLength={40}
              value={config.stingerPromo.brandLabel}
              onChange={(e) =>
                void onPatchConfig({
                  stingerPromo: { ...config.stingerPromo, brandLabel: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="promo-sub">Promo Subtext</label>
            <input
              id="promo-sub"
              type="text"
              maxLength={120}
              value={config.stingerPromo.subtext}
              onChange={(e) =>
                void onPatchConfig({
                  stingerPromo: { ...config.stingerPromo, subtext: e.target.value },
                })
              }
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="promo-headline">Promo Headline</label>
          <input
            id="promo-headline"
            type="text"
            maxLength={160}
            value={config.stingerPromo.headline}
            onChange={(e) =>
              void onPatchConfig({
                stingerPromo: { ...config.stingerPromo, headline: e.target.value },
              })
            }
          />
        </div>

        <div className="field">
          <label htmlFor="promo-upload">Or Upload Custom Stinger Promo Image (1920×168px)</label>
          <input
            id="promo-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void handleUpload('promo', e)}
            disabled={uploadingSlot === 'promo'}
          />
        </div>

        {config.stingerPromo.customImageUrl ? (
          <div className="upload-preview-box">
            <img
              src={config.stingerPromo.customImageUrl}
              alt="Stinger promo preview"
              className="upload-thumb"
              width={112}
              height={46}
            />
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() =>
                void onPatchConfig({
                  stingerPromo: { ...config.stingerPromo, customImageUrl: null },
                })
              }
            >
              Remove
            </button>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
};
