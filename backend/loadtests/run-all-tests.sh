#!/bin/bash

# Load Testing Suite Runner
# Runs all load tests in sequence

set -e

echo "========================================"
echo "servAI Load Testing Suite"
echo "========================================"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 is not installed"
    echo "Install from: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

echo "✅ k6 is installed"
echo ""

# Set API URL
export API_BASE_URL=${API_BASE_URL:-"http://localhost:3000"}
echo "🎯 Target API: $API_BASE_URL"
echo ""

# Create results directory
mkdir -p results
REPORT_DIR="results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$REPORT_DIR"

echo "📁 Results will be saved to: $REPORT_DIR"
echo ""

# Function to run a test and save results
run_test() {
    local test_name=$1
    local test_file=$2
    
    echo "========================================"
    echo "Running: $test_name"
    echo "========================================"
    
    k6 run "$test_file" 2>&1 | tee "$REPORT_DIR/$test_name.log"
    
    # Move generated files to report directory
    mv -f *-results.json "$REPORT_DIR/" 2>/dev/null || true
    mv -f *-summary.txt "$REPORT_DIR/" 2>/dev/null || true
    
    echo ""
    echo "✅ $test_name completed"
    echo ""
    
    # Wait before next test
    sleep 5
}

# Run tests in sequence
echo "🚀 Starting test suite..."
echo ""

# 1. Smoke Test (1 min)
run_test "smoke-test" "smoke-test.js"

# 2. Load Test (16 min)
echo "⚠️  Load test takes ~16 minutes"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_test "load-test" "load-test.js"
fi

# 3. Stress Test (24 min)
echo "⚠️  Stress test takes ~24 minutes and may cause high server load"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_test "stress-test" "stress-test.js"
fi

# 4. Spike Test (5.5 min)
echo "⚠️  Spike test takes ~5.5 minutes"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_test "spike-test" "spike-test.js"
fi

# 5. Soak Test (2h+ hours) - Usually run separately
echo "⚠️  Soak test takes 2+ hours - run separately"
echo "To run: k6 run soak-test.js"
echo ""

# Generate summary report
echo "========================================"
echo "Generating Summary Report"
echo "========================================"

REPORT_FILE="$REPORT_DIR/SUMMARY.md"

cat > "$REPORT_FILE" << EOF
# Load Testing Summary

**Date:** $(date)
**Target:** $API_BASE_URL

## Tests Completed

EOF

# Add test results to summary
for log in "$REPORT_DIR"/*.log; do
    if [ -f "$log" ]; then
        test_name=$(basename "$log" .log)
        echo "### $test_name" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "\`\`\`" >> "$REPORT_FILE"
        tail -n 20 "$log" >> "$REPORT_FILE"
        echo "\`\`\`" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
done

echo "" >> "$REPORT_FILE"
echo "## Files Generated" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
ls -lh "$REPORT_DIR" >> "$REPORT_FILE"

echo "✅ Summary report generated: $REPORT_FILE"
echo ""

echo "========================================"
echo "Test Suite Complete!"
echo "========================================"
echo "Results saved to: $REPORT_DIR"
echo ""
echo "Next steps:"
echo "1. Review results in $REPORT_DIR"
echo "2. Check SUMMARY.md for overview"
echo "3. Analyze JSON files for detailed metrics"
echo "4. Compare with baseline results"
echo ""
