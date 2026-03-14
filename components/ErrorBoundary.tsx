'use client';

import { Component, type ReactNode } from 'react';
import { Box, VStack, Text, Button } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Box p={8} textAlign="center">
          <VStack gap={4}>
            <Text fontSize="xl" fontWeight="700" color={c.text}>
              Something went wrong
            </Text>
            <Text color={c.muted}>
              An unexpected error occurred. Please try again.
            </Text>
            <Button colorPalette="orange" onClick={this.handleReset}>
              Try Again
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}
