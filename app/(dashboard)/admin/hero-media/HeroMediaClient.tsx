'use client';

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Input,
  Textarea,
  Badge,
  NativeSelect,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps, selectProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import type { HomepageMedia } from '@/lib/db/schema';

/* ── Types ────────────────────────────────────────────────── */
type Slide = HomepageMedia;
type AnimationStyle = 'fade' | 'fadeZoom' | 'fadePan' | 'crossfade';

const ANIMATION_OPTIONS: { value: AnimationStyle; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'fadeZoom', label: 'Fade + Zoom' },
  { value: 'fadePan', label: 'Fade + Pan' },
  { value: 'crossfade', label: 'Crossfade' },
];

const POSITION_OPTIONS = [
  'center center',
  'center top',
  'center bottom',
  'left center',
  'right center',
  'left top',
  'right top',
  'left bottom',
  'right bottom',
];

/* ── Component ────────────────────────────────────────────── */
export function HeroMediaClient({ slides: initial }: { slides: Slide[] }) {
  const router = useRouter();
  const [slides, setSlides] = useState<Slide[]>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Global animation ─────────────────────────────── */
  const currentGlobalAnimation: AnimationStyle =
    slides.length > 0 ? (slides[0].animationStyle as AnimationStyle) : 'fadeZoom';

  const setGlobalAnimation = useCallback(async (style: AnimationStyle) => {
    const res = await fetch('/api/admin/homepage-media/animation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ animationStyle: style }),
    });
    if (!res.ok) {
      showToast('error', 'Failed to update animation style');
      return;
    }
    setSlides((prev) => prev.map((s) => ({ ...s, animationStyle: style })));
    showToast('success', `Animation set to ${ANIMATION_OPTIONS.find((a) => a.value === style)?.label}`);
  }, [showToast]);

  /* ── Reorder helpers ──────────────────────────────── */
  const moveSlide = useCallback(async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSlides(reordered);

    const res = await fetch('/api/admin/homepage-media/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map((s) => s.id) }),
    });
    if (!res.ok) showToast('error', 'Failed to reorder');
  }, [slides, showToast]);

  /* ── Toggle active ─────────────────────────────────── */
  const toggleActive = useCallback(async (slide: Slide) => {
    const res = await fetch(`/api/admin/homepage-media/${slide.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !slide.isActive }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast('error', data.error || 'Failed to update');
      return;
    }
    setSlides((prev) =>
      prev.map((s) => (s.id === slide.id ? { ...s, isActive: !s.isActive } : s)),
    );
    showToast('success', slide.isActive ? 'Slide hidden' : 'Slide visible');
  }, [showToast]);

  /* ── Delete ────────────────────────────────────────── */
  const deleteSlide = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this slide?')) return;
    const res = await fetch(`/api/admin/homepage-media/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      showToast('error', data.error || 'Failed to delete');
      return;
    }
    setSlides((prev) => prev.filter((s) => s.id !== id));
    showToast('success', 'Slide deleted');
  }, [showToast]);

  /* ── Update metadata ───────────────────────────────── */
  const updateSlide = useCallback(async (id: string, formData: FormData) => {
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const [key, val] of formData.entries()) {
      if (key === 'isActive') continue;
      payload[key] = val === '' ? null : String(val);
    }
    const res = await fetch(`/api/admin/homepage-media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      showToast('error', 'Failed to update');
      return;
    }
    const updated = await res.json();
    setSlides((prev) => prev.map((s) => (s.id === id ? updated : s)));
    setEditId(null);
    showToast('success', 'Slide updated');
  }, [showToast]);

  /* ── Upload new image ──────────────────────────────── */
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      // 1. Upload file
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch('/api/admin/homepage-media/upload', {
        method: 'POST',
        body: fd,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        showToast('error', data.error || 'Upload failed');
        return;
      }
      const { url } = await uploadRes.json();

      // 2. Create slide record
      const createRes = await fetch('/api/admin/homepage-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          src: url,
          alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          eyebrow: 'NEW SLIDE',
          title: 'Edit Title',
        }),
      });
      if (!createRes.ok) {
        showToast('error', 'Failed to create slide record');
        return;
      }
      const newSlide = await createRes.json();
      setSlides((prev) => [...prev, newSlide]);
      setEditId(newSlide.id);
      showToast('success', 'Image uploaded — edit the details below');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [showToast]);

  /* ── Replace image for existing slide ──────────────── */
  const replaceImage = useCallback(async (slideId: string, file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch('/api/admin/homepage-media/upload', {
        method: 'POST',
        body: fd,
      });
      if (!uploadRes.ok) {
        showToast('error', 'Upload failed');
        return;
      }
      const { url } = await uploadRes.json();

      const patchRes = await fetch(`/api/admin/homepage-media/${slideId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: url }),
      });
      if (!patchRes.ok) {
        showToast('error', 'Failed to update image');
        return;
      }
      const updated = await patchRes.json();
      setSlides((prev) => prev.map((s) => (s.id === slideId ? updated : s)));
      showToast('success', 'Image replaced');
    } finally {
      setUploading(false);
    }
  }, [showToast]);

  /* ── Render ─────────────────────────────────────────── */
  return (
    <VStack align="stretch" gap={6} pb={20}>
      {/* Toast */}
      {toast && (
        <Box
          position="fixed"
          top="16px"
          right="16px"
          zIndex={9999}
          px={4}
          py={3}
          borderRadius="md"
          bg={toast.type === 'success' ? '#22C55E' : '#EF4444'}
          color="white"
          fontSize="14px"
          fontWeight="500"
          style={{ animation: 'fadeUp 0.3s ease-out both' }}
        >
          {toast.message}
        </Box>
      )}

      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={4} style={anim.fadeUp()}>
        <Box>
          <Heading size="lg" color={c.text}>Hero Media</Heading>
          <Text color={c.muted} mt={1}>
            Manage homepage hero image slides ({slides.filter((s) => s.isActive).length} active / {slides.length} total)
          </Text>
        </Box>
        <Button
          bg={c.accent}
          color="white"
          _hover={{ bg: c.accentHover }}
          minH="48px"
          px={6}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Uploading...' : '+ Add Slide'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </Flex>

      {/* ── Animation Style Selector ──────────────────── */}
      <Box
        bg={c.card}
        p={{ base: 4, md: 5 }}
        borderRadius="md"
        borderWidth="1px"
        borderColor={c.border}
        style={anim.fadeUp('0.5s', '0.05s')}
        opacity={slides.length === 0 ? 0.5 : 1}
      >
        <Text fontSize="13px" color={c.muted} mb={3} fontWeight="500">
          Hero Animation Style
        </Text>
        <Flex gap={3} wrap="wrap">
          {ANIMATION_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              bg={currentGlobalAnimation === opt.value ? 'rgba(249,115,22,0.15)' : c.surface}
              color={currentGlobalAnimation === opt.value ? c.accent : c.text}
              borderWidth="1px"
              borderColor={currentGlobalAnimation === opt.value ? c.accent : c.border}
              _hover={{
                bg: currentGlobalAnimation === opt.value ? 'rgba(249,115,22,0.2)' : c.border,
              }}
              fontSize="14px"
              px={5}
              minH="44px"
              borderRadius="6px"
              fontWeight={currentGlobalAnimation === opt.value ? '600' : '400'}
              disabled={slides.length === 0}
              onClick={() => setGlobalAnimation(opt.value)}
            >
              {opt.label}
              {currentGlobalAnimation === opt.value && (
                <Box as="span" ml={2} fontSize="11px" opacity={0.7}>
                  (active)
                </Box>
              )}
            </Button>
          ))}
        </Flex>
        <Text fontSize="11px" color={c.muted} mt={2}>
          Applies to all slides on the live homepage hero showcase.
        </Text>
      </Box>

      {/* Slides Grid */}
      {slides.length === 0 && (
        <Box
          bg={c.card}
          p={{ base: 6, md: 10 }}
          borderRadius="md"
          borderWidth="1px"
          borderColor={c.border}
          textAlign="center"
        >
          <Text color={c.text} fontSize="17px" fontWeight="600" mb={2}>
            No hero slides yet
          </Text>
          <Text color={c.muted} fontSize="14px" mb={1}>
            Upload your first hero image using the &quot;+ Add Slide&quot; button above.
          </Text>
          <Text color={c.muted} fontSize="13px">
            Each slide can have a title, caption, alt text, and custom position.
            Choose an animation style above — it will apply to all slides on the homepage.
          </Text>
        </Box>
      )}

      {slides.map((slide, index) => {
        const isEditing = editId === slide.id;

        return (
          <Box
            key={slide.id}
            bg={c.card}
            borderRadius="md"
            borderWidth="1px"
            borderColor={isEditing ? c.accent : c.border}
            overflow="hidden"
            opacity={slide.isActive ? 1 : 0.5}
            transition="opacity 0.2s, border-color 0.2s"
            style={anim.fadeUp('0.5s', `${index * 0.05}s`)}
          >
            <Flex direction={{ base: 'column', md: 'row' }}>
              {/* Image Preview */}
              <Box
                position="relative"
                w={{ base: '100%', md: '280px' }}
                minH={{ base: '180px', md: '180px' }}
                flexShrink={0}
                bg={c.surface}
              >
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  sizes="280px"
                  style={{ objectFit: 'cover', objectPosition: slide.objectPosition }}
                />
                <Badge
                  position="absolute"
                  top="8px"
                  left="8px"
                  bg={slide.isActive ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}
                  color={slide.isActive ? '#22C55E' : '#EF4444'}
                  fontSize="11px"
                  px={2}
                  py={0.5}
                  borderRadius="4px"
                >
                  {slide.isActive ? 'Active' : 'Hidden'}
                </Badge>
                <Badge
                  position="absolute"
                  top="8px"
                  right="8px"
                  bg="rgba(0,0,0,0.6)"
                  color={c.muted}
                  fontSize="11px"
                  px={2}
                  py={0.5}
                  borderRadius="4px"
                >
                  #{index + 1}
                </Badge>
              </Box>

              {/* Info / Actions */}
              <Box flex={1} p={{ base: 4, md: 5 }}>
                {isEditing ? (
                  <SlideEditForm
                    slide={slide}
                    saving={saving}
                    onSave={updateSlide}
                    onCancel={() => setEditId(null)}
                    onReplace={(file) => replaceImage(slide.id, file)}
                    uploading={uploading}
                  />
                ) : (
                  <VStack align="stretch" gap={3}>
                    <HStack justify="space-between" wrap="wrap" gap={2}>
                      <Box>
                        <Text fontSize="11px" color={c.accent} letterSpacing="0.12em">
                          {slide.eyebrow}
                        </Text>
                        <Text fontSize="18px" color={c.text} fontWeight="600">
                          {slide.title}
                        </Text>
                        {slide.caption && (
                          <Text fontSize="13px" color={c.muted}>{slide.caption}</Text>
                        )}
                      </Box>
                      <HStack gap={1}>
                        <Badge
                          bg="rgba(249,115,22,0.1)"
                          color={c.accent}
                          fontSize="11px"
                          px={2}
                          py={0.5}
                          borderRadius="4px"
                        >
                          {ANIMATION_OPTIONS.find((a) => a.value === slide.animationStyle)?.label || slide.animationStyle}
                        </Badge>
                      </HStack>
                    </HStack>

                    <Text fontSize="12px" color={c.muted} lineClamp={2}>
                      Alt: {slide.alt}
                    </Text>

                    <Flex gap={3} fontSize="11px" color={c.muted} wrap="wrap">
                      <Text>ID: {slide.id.slice(0, 8)}</Text>
                      <Text>File: {slide.src.split('/').pop()}</Text>
                      <Text>Position: {slide.objectPosition}</Text>
                    </Flex>

                    <Flex gap={2} wrap="wrap" mt={1}>
                      <SmallButton onClick={() => moveSlide(index, -1)} disabled={index === 0}>
                        ▲ Up
                      </SmallButton>
                      <SmallButton onClick={() => moveSlide(index, 1)} disabled={index === slides.length - 1}>
                        ▼ Down
                      </SmallButton>
                      <SmallButton onClick={() => toggleActive(slide)}>
                        {slide.isActive ? '👁 Hide' : '👁 Show'}
                      </SmallButton>
                      <SmallButton onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/jpeg,image/png,image/webp';
                        input.onchange = (ev) => {
                          const file = (ev.target as HTMLInputElement).files?.[0];
                          if (file) replaceImage(slide.id, file);
                        };
                        input.click();
                      }}>
                        Replace Image
                      </SmallButton>
                      <SmallButton onClick={() => setEditId(slide.id)}>Edit Details</SmallButton>
                      <SmallButton onClick={() => deleteSlide(slide.id)} variant="danger">
                        Remove
                      </SmallButton>
                    </Flex>
                  </VStack>
                )}
              </Box>
            </Flex>
          </Box>
        );
      })}
    </VStack>
  );
}

/* ── Edit Form Sub-component ──────────────────────────────── */
function SlideEditForm({
  slide,
  saving,
  onSave,
  onCancel,
  onReplace,
  uploading,
}: {
  slide: Slide;
  saving: boolean;
  onSave: (id: string, fd: FormData) => void;
  onCancel: () => void;
  onReplace: (file: File) => void;
  uploading: boolean;
}) {
  const replaceRef = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(slide.id, new FormData(e.currentTarget));
      }}
    >
      <VStack align="stretch" gap={3}>
        <Flex gap={3} direction={{ base: 'column', md: 'row' }}>
          <Box flex={1}>
            <Text fontSize="12px" color={c.muted} mb={1}>Eyebrow</Text>
            <Input {...inputProps} name="eyebrow" defaultValue={slide.eyebrow} />
          </Box>
          <Box flex={1}>
            <Text fontSize="12px" color={c.muted} mb={1}>Title</Text>
            <Input {...inputProps} name="title" defaultValue={slide.title} />
          </Box>
        </Flex>

        <Box>
          <Text fontSize="12px" color={c.muted} mb={1}>Caption</Text>
          <Input {...inputProps} name="caption" defaultValue={slide.caption ?? ''} />
        </Box>

        <Box>
          <Text fontSize="12px" color={c.muted} mb={1}>Alt Text (SEO)</Text>
          <Textarea {...textareaProps} name="alt" defaultValue={slide.alt} minH="80px" rows={2} />
        </Box>

        <Flex gap={3} direction={{ base: 'column', md: 'row' }}>
          <Box flex={1}>
            <Text fontSize="12px" color={c.muted} mb={1}>Object Position</Text>
            <NativeSelect.Root>
              <NativeSelect.Field
                {...selectProps}
                name="objectPosition"
                defaultValue={slide.objectPosition}
              >
                {POSITION_OPTIONS.map((pos) => (
                  <option key={pos} value={pos} style={{ background: c.card, color: c.text }}>
                    {pos}
                  </option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Box>
          <Box flex={1}>
            <Text fontSize="12px" color={c.muted} mb={1}>Animation Style</Text>
            <NativeSelect.Root>
              <NativeSelect.Field
                {...selectProps}
                name="animationStyle"
                defaultValue={slide.animationStyle}
              >
                {ANIMATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ background: c.card, color: c.text }}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Box>
        </Flex>

        <Flex gap={2} mt={2} wrap="wrap">
          <Button
            type="submit"
            bg={c.accent}
            color="white"
            _hover={{ bg: c.accentHover }}
            minH="40px"
            px={5}
            fontSize="14px"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            bg={c.surface}
            color={c.text}
            _hover={{ bg: c.border }}
            minH="40px"
            px={5}
            fontSize="14px"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            bg={c.surface}
            color={c.text}
            _hover={{ bg: c.border }}
            minH="40px"
            px={5}
            fontSize="14px"
            disabled={uploading}
            onClick={() => replaceRef.current?.click()}
          >
            {uploading ? 'Uploading...' : 'Replace Image'}
          </Button>
          <input
            ref={replaceRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onReplace(file);
            }}
          />
        </Flex>
      </VStack>
    </form>
  );
}

/* ── Small action button ──────────────────────────────────── */
function SmallButton({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'danger';
}) {
  return (
    <Button
      size="xs"
      bg={variant === 'danger' ? 'rgba(239,68,68,0.1)' : c.surface}
      color={variant === 'danger' ? '#EF4444' : c.text}
      _hover={{
        bg: variant === 'danger' ? 'rgba(239,68,68,0.2)' : c.border,
      }}
      borderWidth="1px"
      borderColor={variant === 'danger' ? 'rgba(239,68,68,0.3)' : c.border}
      fontSize="12px"
      px={3}
      minH="32px"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
