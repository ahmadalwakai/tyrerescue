'use client';

import { Box, Container, Flex, Link as ChakraLink, SimpleGrid, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { emergencyCampaign, type ServiceArea } from '@/lib/ads/emergencyCampaign';

type EmergencyCoverageSectionProps = {
  readonly areas?: readonly ServiceArea[];
  readonly currentArea?: ServiceArea;
};

export function EmergencyCoverageSection({
  areas = emergencyCampaign.serviceAreas,
  currentArea,
}: EmergencyCoverageSectionProps) {
  const visibleAreas = areas.length > 0 ? areas : emergencyCampaign.serviceAreas;

  return (
    <Box as="section" bg={colorTokens.surface} py={{ base: '44px', md: '72px' }} px={{ base: 4, md: 8 }}>
      <Container maxW="1180px" px={0}>
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: '28px', lg: '48px' }} alignItems="start">
          <Box>
            <Text
              as="h2"
              fontSize={{ base: '32px', md: '52px' }}
              lineHeight="1"
              color={colorTokens.text}
              mb="14px"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Scotland mainland emergency coverage
            </Text>
            <Text fontSize={{ base: '15px', md: '17px' }} color={colorTokens.muted} lineHeight="1.75" style={{ fontFamily: 'var(--font-body)' }}>
              Tyre Rescue covers mainland Scotland only. We help drivers in Glasgow, Edinburgh, Dundee, Stirling, Paisley, Hamilton, Kilmarnock, Ayr, Kirkcaldy, Perth, and nearby mainland routes. Scottish islands are excluded.
            </Text>
            {currentArea && (
              <Box mt="18px" bg={colorTokens.card} borderWidth="1px" borderColor={colorTokens.border} borderRadius="8px" p="18px">
                <Text color={colorTokens.text} fontWeight="800" mb="6px" style={{ fontFamily: 'var(--font-body)' }}>
                  Local dispatch note
                </Text>
                <Text fontSize="14px" color={colorTokens.muted} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                  For {currentArea.areaName}, {currentArea.cityName}, we confirm access near {currentArea.landmark}, tyre size, and fitter availability before dispatch.
                </Text>
              </Box>
            )}
          </Box>

          <Box>
            <Text color={colorTokens.text} fontSize="15px" fontWeight="800" mb="14px" style={{ fontFamily: 'var(--font-body)' }}>
              Priority emergency landing areas
            </Text>
            <Flex wrap="wrap" gap="10px">
              {visibleAreas.map((area) => (
                <ChakraLink
                  key={area.emergencyPath}
                  href={area.emergencyPath}
                  px="13px"
                  py="10px"
                  minH="42px"
                  display="inline-flex"
                  alignItems="center"
                  bg={currentArea?.emergencyPath === area.emergencyPath ? colorTokens.accent : colorTokens.card}
                  color={currentArea?.emergencyPath === area.emergencyPath ? 'white' : colorTokens.text}
                  borderWidth="1px"
                  borderColor={currentArea?.emergencyPath === area.emergencyPath ? colorTokens.accent : colorTokens.border}
                  borderRadius="8px"
                  fontSize="14px"
                  fontWeight="700"
                  textDecoration="none"
                  _hover={{
                    textDecoration: 'none',
                    borderColor: colorTokens.accent,
                  }}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {area.cityName} {area.areaName}
                </ChakraLink>
              ))}
            </Flex>
          </Box>
        </SimpleGrid>
      </Container>
    </Box>
  );
}
