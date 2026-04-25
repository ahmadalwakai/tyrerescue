'use client';

/**
 * Manual fallback — three dropdowns for width / aspect / rim. Used when
 * the VRM lookup misses, or when the user prefers to type their size.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  NativeSelect,
  Stack,
  Text,
} from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import type { TyreSize } from '@/types/vehicle';

const c = colorTokens;

const WIDTHS = ['155', '165', '175', '185', '195', '205', '215', '225', '235', '245', '255', '265', '275', '285'];
const ASPECTS = ['30', '35', '40', '45', '50', '55', '60', '65', '70', '75'];
const RIMS = ['13', '14', '15', '16', '17', '18', '19', '20', '21', '22'];

export interface ManualSizeInputProps {
  initial?: TyreSize | null;
  onChange: (size: TyreSize) => void;
}

export function ManualSizeInput({ initial, onChange }: ManualSizeInputProps) {
  const [width, setWidth] = useState(initial?.width ?? '205');
  const [aspect, setAspect] = useState(initial?.aspect ?? '55');
  const [rim, setRim] = useState(initial?.rim ?? '16');

  useEffect(() => {
    onChange({ width, aspect, rim });
  }, [width, aspect, rim, onChange]);

  return (
    <Box>
      <Text fontSize="11px" color={c.accent} letterSpacing="0.12em" textTransform="uppercase" fontWeight="700" mb={2}>
        Tyre size
      </Text>
      <Stack direction={{ base: 'column', md: 'row' }} gap={2}>
        <SelectField label="Width" value={width} onChange={setWidth} options={WIDTHS} />
        <SelectField label="Aspect" value={aspect} onChange={setAspect} options={ASPECTS} />
        <SelectField label="Rim" value={rim} onChange={setRim} options={RIMS} prefix="R" />
      </Stack>
      <Text mt={3} color={c.muted} fontSize="13px">
        Selected:{' '}
        <Box as="span" color={c.text} fontWeight="700" fontFamily="monospace">
          {width}/{aspect}R{rim}
        </Box>
      </Text>
    </Box>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  prefix?: string;
}) {
  return (
    <Flex direction="column" flex={1} gap={1}>
      <Text fontSize="11px" color={c.muted} letterSpacing="0.08em" textTransform="uppercase">
        {label}
      </Text>
      <NativeSelect.Root size="lg">
        <NativeSelect.Field
          aria-label={label}
          title={label}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          bg={c.bg}
          color={c.text}
          borderColor={c.border}
          h="48px"
          fontWeight="600"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {prefix ? `${prefix}${opt}` : opt}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Flex>
  );
}

/** Helper button that surfaces the manual flow from another component. */
export function ManualSizeToggle({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      borderColor={c.border}
      color={c.text}
      bg="transparent"
      fontWeight="600"
      onClick={onClick}
    >
      Don&apos;t know your reg? Enter size manually
    </Button>
  );
}
