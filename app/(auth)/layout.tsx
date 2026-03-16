import { Box, Container } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { BackButton } from '@/components/ui/BackButton';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box
      minH="100vh"
      bg={c.bg}
      display="flex"
      alignItems="center"
      justifyContent="center"
      py={8}
    >
      <Container maxW="440px" px={4}>
        <Box mb={4}>
          <BackButton />
        </Box>
        {children}
      </Container>
    </Box>
  );
}
