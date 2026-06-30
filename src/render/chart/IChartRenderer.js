export class IChartRenderer {
    render(ctx, chart, data, plotArea, style) {
        throw new Error("IChartRenderer.render() must be implemented by subclass");
    }

    hitTest(px, py, chart, viewport) {
        return chart.containsPoint(px, py, viewport);
    }

    destroy() {}
}
