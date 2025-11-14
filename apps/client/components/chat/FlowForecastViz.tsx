/**
 * Flow Forecast Visualization Component
 * 
 * Renders a trend chart for smart money flow forecasts with:
 * - Historical netflow data
 * - Predicted future inflow
 * - Visual indicators for pump probability and risk
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface FlowForecastData {
  token: string;
  chain: string;
  currentNetflow: number;
  predictedInflow: number;
  pumpProbability: number;
  riskScore: number;
  confidence: number;
  forecastHorizon: string;
  recommendation: 'buy' | 'hold' | 'sell' | 'watch';
  reasoning: string;
  positionQuote?: {
    inputAmount: string;
    inputToken: string;
    outputAmount: string;
    outputToken: string;
    slippage: string;
  };
}

interface FlowForecastVizProps {
  data: FlowForecastData;
}

const CHART_WIDTH = Dimensions.get('window').width - 48; // Account for padding
const CHART_HEIGHT = 180;
const PADDING = 32;

export const FlowForecastViz: React.FC<FlowForecastVizProps> = ({ data }) => {
  // Animated values for smooth entrance
  const chartOpacity = useSharedValue(0);
  const barScale = useSharedValue(0);
  const probabilityScale = useSharedValue(0);

  useEffect(() => {
    // Stagger animations for visual appeal
    chartOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    barScale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
    probabilityScale.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const chartStyle = useAnimatedStyle(() => ({
    opacity: chartOpacity.value,
  }));

  const barAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: barScale.value }],
  }));

  const probabilityAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: probabilityScale.value }],
  }));

  // Calculate bar heights (normalize to chart height)
  const maxValue = Math.max(Math.abs(data.currentNetflow), Math.abs(data.predictedInflow), 1);
  const currentHeight = (Math.abs(data.currentNetflow) / maxValue) * (CHART_HEIGHT - PADDING * 2);
  const predictedHeight = (Math.abs(data.predictedInflow) / maxValue) * (CHART_HEIGHT - PADDING * 2);

  // Determine colors based on recommendation
  const getRecommendationColor = () => {
    switch (data.recommendation) {
      case 'buy': return '#10b981'; // Green
      case 'hold': return '#3b82f6'; // Blue
      case 'sell': return '#ef4444'; // Red
      case 'watch': return '#f59e0b'; // Amber
      default: return '#6b7280'; // Gray
    }
  };

  const recommendationColor = getRecommendationColor();

  // Format large numbers
  const formatNumber = (num: number) => {
    if (Math.abs(num) >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (Math.abs(num) >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toFixed(0);
  };

  return (
    <Animated.View style={[styles.container, chartStyle]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {data.token} Flow Forecast ({data.forecastHorizon})
        </Text>
        <View style={[styles.badge, { backgroundColor: recommendationColor + '20' }]}>
          <Text style={[styles.badgeText, { color: recommendationColor }]}>
            {data.recommendation.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Pump Probability</Text>
          <Text style={[styles.metricValue, { color: data.pumpProbability > 60 ? '#10b981' : '#6b7280' }]}>
            {data.pumpProbability.toFixed(1)}%
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Risk Score</Text>
          <Text style={[styles.metricValue, { color: data.riskScore > 50 ? '#ef4444' : '#10b981' }]}>
            {data.riskScore.toFixed(1)}/100
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Confidence</Text>
          <Text style={[styles.metricValue, { color: data.confidence > 50 ? '#10b981' : '#ef4444' }]}>
            {data.confidence.toFixed(1)}%
          </Text>
        </View>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        {/* Baseline */}
        <View style={styles.baseline} />

        {/* Bars */}
        <View style={styles.barsContainer}>
          {/* Current Netflow Bar */}
          <View style={styles.barWrapper}>
            <Animated.View
              style={[
                styles.bar,
                barAnimatedStyle,
                {
                  height: currentHeight,
                  backgroundColor: data.currentNetflow >= 0 ? '#10b98180' : '#ef444480',
                  bottom: data.currentNetflow >= 0 ? PADDING : undefined,
                  top: data.currentNetflow < 0 ? PADDING : undefined,
                },
              ]}
            />
            <Text style={styles.barLabel}>Current</Text>
            <Text style={styles.barValue}>{formatNumber(data.currentNetflow)}</Text>
          </View>

          {/* Predicted Inflow Bar */}
          <View style={styles.barWrapper}>
            <Animated.View
              style={[
                styles.bar,
                barAnimatedStyle,
                {
                  height: predictedHeight,
                  backgroundColor: data.predictedInflow >= 0 ? '#10b981' : '#ef4444',
                  bottom: data.predictedInflow >= 0 ? PADDING : undefined,
                  top: data.predictedInflow < 0 ? PADDING : undefined,
                },
              ]}
            />
            <Text style={styles.barLabel}>Predicted</Text>
            <Text style={styles.barValue}>{formatNumber(data.predictedInflow)}</Text>
          </View>
        </View>

        {/* Axis Labels */}
        <View style={styles.axisLabels}>
          <Text style={styles.axisLabel}>Netflow</Text>
          <Text style={styles.axisLabel}>{data.forecastHorizon}</Text>
        </View>
      </View>

      {/* Pump Probability Bar */}
      <View style={styles.probabilityContainer}>
        <Text style={styles.probabilityLabel}>Pump Probability</Text>
        <View style={styles.probabilityBarBg}>
          <Animated.View
            style={[
              styles.probabilityBarFill,
              probabilityAnimatedStyle,
              {
                width: `${data.pumpProbability}%`,
                backgroundColor: data.pumpProbability > 70 ? '#10b981' : data.pumpProbability > 40 ? '#f59e0b' : '#ef4444',
              },
            ]}
          />
        </View>
        <Text style={styles.probabilityValue}>{data.pumpProbability.toFixed(1)}%</Text>
      </View>

      {/* Position Quote (if available) */}
      {data.positionQuote && (
        <View style={styles.quoteContainer}>
          <Text style={styles.quoteTitle}>💱 Position Quote</Text>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteText}>
              {data.positionQuote.inputAmount} {data.positionQuote.inputToken}
            </Text>
            <Text style={styles.quoteArrow}>→</Text>
            <Text style={styles.quoteText}>
              ~{data.positionQuote.outputAmount} {data.positionQuote.outputToken}
            </Text>
          </View>
          <Text style={styles.quoteSlippage}>
            Slippage: {data.positionQuote.slippage}
          </Text>
        </View>
      )}

      {/* Reasoning */}
      <View style={styles.reasoningContainer}>
        <Text style={styles.reasoningLabel}>Analysis</Text>
        <Text style={styles.reasoningText}>{data.reasoning}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  chartContainer: {
    height: CHART_HEIGHT,
    marginBottom: 16,
    position: 'relative',
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: CHART_HEIGHT / 2,
    height: 1,
    backgroundColor: '#3a3a3a',
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: '100%',
    paddingHorizontal: 32,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  bar: {
    width: 60,
    borderRadius: 4,
    position: 'absolute',
    transformOrigin: 'bottom',
  },
  barLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
    position: 'absolute',
    bottom: 8,
  },
  barValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    position: 'absolute',
    bottom: -20,
  },
  axisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  axisLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  probabilityContainer: {
    marginBottom: 16,
  },
  probabilityLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 6,
  },
  probabilityBarBg: {
    height: 24,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 4,
  },
  probabilityBarFill: {
    height: '100%',
    borderRadius: 6,
    transformOrigin: 'left',
  },
  probabilityValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'right',
  },
  quoteContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  quoteTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quoteText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  quoteArrow: {
    fontSize: 14,
    color: '#9ca3af',
    marginHorizontal: 8,
  },
  quoteSlippage: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
  reasoningContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  reasoningLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 6,
  },
  reasoningText: {
    fontSize: 13,
    color: '#d1d5db',
    lineHeight: 18,
  },
});



