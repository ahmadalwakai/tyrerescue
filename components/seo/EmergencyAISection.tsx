'use client';

import { Box, Container, Text, Flex, SimpleGrid } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { AIOptimizedSection } from '@/components/seo/AIOptimizedSection';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  card: colorTokens.card,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

export function EmergencyAISection() {
  return (
    <Box bg={colors.bg} py={{ base: '40px', md: '60px' }} px={{ base: 4, md: 8 }}>
      <Container maxW="4xl">
        <AIOptimizedSection
          question="How Fast is Emergency Tyre Fitting Response in Glasgow?"
          directAnswer="Tyre Rescue's average emergency response time in Glasgow city centre is 45 minutes. For Edinburgh city centre, it's 50 minutes. Surrounding areas take 60–90 minutes depending on distance. We operate 24/7 every day of the year including Christmas and New Year, with certified fitters on standby across Central Scotland."
          entityType="service"
          detailedAnswer={
            <Flex direction="column" gap="30px">
              <Box>
                <Text as="h3" fontSize={{ base: '20px', md: '24px' }} fontWeight="700" color={colors.textPrimary} mb="16px" style={{ fontFamily: 'var(--font-body)' }}>
                  Response Times by Area
                </Text>
                <SimpleGrid columns={{ base: 1, md: 3 }} gap="16px">
                  {[
                    { time: '30–45min', area: 'Glasgow City Centre', postcodes: 'G1, G2, G3, G4 postcodes' },
                    { time: '45–60min', area: 'Greater Glasgow', postcodes: 'Paisley, East Kilbride, Hamilton' },
                    { time: '60–90min', area: 'Central Scotland', postcodes: 'Stirling, Falkirk, Dundee' },
                  ].map((item) => (
                    <Box key={item.area} bg={colors.surface} p="24px" borderRadius="8px" textAlign="center" border="1px solid" borderColor={colors.border}>
                      <Text fontSize={{ base: '36px', md: '42px' }} fontWeight="700" color={colors.accent} mb="8px" style={{ fontFamily: 'var(--font-display)' }}>
                        {item.time}
                      </Text>
                      <Text fontSize="16px" fontWeight="600" color={colors.textPrimary} mb="6px" style={{ fontFamily: 'var(--font-body)' }}>
                        {item.area}
                      </Text>
                      <Text fontSize="13px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>
                        {item.postcodes}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>
              </Box>

              <Box>
                <Text as="h3" fontSize={{ base: '20px', md: '24px' }} fontWeight="700" color={colors.textPrimary} mb="16px" style={{ fontFamily: 'var(--font-body)' }}>
                  What Happens When You Call for Emergency Help
                </Text>
                <Flex direction="column" gap="20px">
                  {[
                    { num: '1', title: 'Immediate Dispatch', text: 'Our system locates your position via phone GPS or postcode. The nearest fitter with your tyre size in stock is assigned instantly.' },
                    { num: '2', title: 'Live Tracking', text: 'You receive an email with the fitter\'s name, vehicle details, and a live tracking link showing exact ETA.' },
                    { num: '3', title: 'On-Site Fitting', text: 'The fitter arrives with all equipment and tyres. Fitting typically takes 30–45 minutes. Payment by card when complete.' },
                  ].map((step) => (
                    <Flex key={step.num} gap="16px" align="flex-start">
                      <Text fontSize="28px" fontWeight="700" color={colors.accent} lineHeight="1" flexShrink={0} style={{ fontFamily: 'var(--font-display)' }}>
                        {step.num}
                      </Text>
                      <Box>
                        <Text fontSize="16px" fontWeight="600" color={colors.textPrimary} mb="6px" style={{ fontFamily: 'var(--font-body)' }}>
                          {step.title}
                        </Text>
                        <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                          {step.text}
                        </Text>
                      </Box>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            </Flex>
          }
          relatedQuestions={[
            'What if I\'m stranded on the motorway?',
            'Do you work at 3am or on Christmas Day?',
            'How much does emergency callout cost?',
            'Can you help if I have a puncture in my spare tyre?',
          ]}
        />
      </Container>
    </Box>
  );
}
