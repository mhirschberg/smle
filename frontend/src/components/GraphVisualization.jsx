import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { graphApi } from '../services/api';
import { Loader, Users, Hash, Maximize2, RefreshCw, ZoomIn, ZoomOut, MousePointer2, Sparkles, Zap, HelpCircle } from 'lucide-react';

const GraphVisualization = ({ campaignId }) => {
    const fgRef = useRef();
    const [data, setData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('influence'); // 'influence', 'topics', or 'communities'
    const [selectedNode, setSelectedNode] = useState(null);
    const [pathStartNode, setPathStartNode] = useState(null);
    const [isPathfindingMode, setIsPathfindingMode] = useState(false);
    const [pathStatus, setPathStatus] = useState(null); // 'searching', 'not_found'
    const [showHelp, setShowHelp] = useState(false);

    const loadGraphData = async (type) => {
        try {
            setLoading(true);
            setPathStatus(null);
            let res;
            if (type === 'influence') res = await graphApi.getInfluence(campaignId);
            else if (type === 'topics') res = await graphApi.getTopics(campaignId);
            else if (type === 'communities') res = await graphApi.getCommunities(campaignId);

            // Transform backend response to ForceGraph format
            const graphData = {
                nodes: res.data.nodes.map(n => ({
                    ...n,
                    val: type === 'influence' ? (n.influenceScore || 1) : (n.value || n.topicCount || 2),
                    color: type === 'communities' ? getCommunityColor(n.community) : null
                })),
                links: (res.data.edges || []).map(e => ({
                    source: e.source,
                    target: e.target,
                    value: e.value || 1
                }))
            };

            setData(graphData);
            setPathStartNode(null);
        } catch (error) {
            console.error('Failed to load graph data:', error);
        } finally {
            setLoading(false);
        }
    };

    const findPath = async (targetNode) => {
        if (!pathStartNode) return;
        if (targetNode.id === pathStartNode.id) {
            setPathStartNode(null);
            return;
        }

        try {
            setLoading(true);
            setPathStatus('searching');
            const res = await graphApi.getPath(pathStartNode.id, targetNode.id);
            if (res.data.nodes && res.data.nodes.length > 0) {
                setData({
                    nodes: res.data.nodes.map(n => ({ ...n, val: 5, isPathNode: true })),
                    links: res.data.edges.map(e => ({ ...e, isPathLink: true }))
                });
                setIsPathfindingMode(false);
                setPathStartNode(null);
                setPathStatus(null);
            } else {
                setPathStatus('not_found');
                setTimeout(() => setPathStatus(null), 3000);
            }
        } catch (error) {
            console.error('Path finding failed', error);
            setPathStatus('not_found');
        } finally {
            setLoading(false);
        }
    };

    const suggestPath = async () => {
        // Client-side magic: Find a guaranteed connected pair from the visible graph
        if (data.links.length === 0) {
            setPathStatus('not_found');
            return;
        }

        try {
            setLoading(true);

            // 1. Build Adjacency List
            const adj = {};
            data.links.forEach((link) => {
                // Determine IDs (link.source might be an object ref or string id)
                const sId = typeof link.source === 'object' ? link.source.id : link.source;
                const tId = typeof link.target === 'object' ? link.target.id : link.target;

                if (!adj[sId]) adj[sId] = [];
                if (!adj[tId]) adj[tId] = [];
                adj[sId].push(tId);
                adj[tId].push(sId);
            });

            // 2. Find Largest Connected Component (BFS)
            const visited = new Set();
            let largestComponent = [];

            Object.keys(adj).forEach((nodeId) => {
                if (visited.has(nodeId)) return;

                const component = [];
                const queue = [nodeId];
                visited.add(nodeId);

                while (queue.length > 0) {
                    const curr = queue.shift();
                    component.push(curr);
                    // Add neighbors
                    if (adj[curr]) {
                        adj[curr].forEach((neighbor) => {
                            if (!visited.has(neighbor)) {
                                visited.add(neighbor);
                                queue.push(neighbor);
                            }
                        });
                    }
                }

                if (component.length > largestComponent.length) {
                    largestComponent = component;
                }
            });

            // 3. Pick two distinct nodes from the largest component
            if (largestComponent.length < 2) {
                setPathStatus('not_found');
                return;
            }

            // Shuffle and pick
            const shuffled = largestComponent.sort(() => 0.5 - Math.random());
            const startId = shuffled[0];
            // Pick a target at distance > 1 if possible for a better demo
            let endId = shuffled[1];

            // Try to find a slightly distant node
            for (let i = 1; i < Math.min(shuffled.length, 10); i++) {
                if (!adj[startId].includes(shuffled[i])) { // Not directly connected
                    endId = shuffled[i];
                    break;
                }
            }

            const startNode = data.nodes.find((n) => n.id === startId);
            const endNode = data.nodes.find((n) => n.id === endId);

            if (startNode && endNode) {
                setPathStartNode(startNode);
                await findPath(endNode);
            } else {
                setPathStatus('not_found');
            }

        } catch (error) {
            console.error('Failed to suggest path', error);
            setPathStatus('not_found');
        } finally {
            setLoading(false);
        }
    };

    const getCommunityColor = (community) => {
        // More vivid community colors, avoiding the default blue
        const colors = ['#F87171', '#34D399', '#FBBF24', '#A78BFA', '#F472B6', '#FB923C', '#2DD4BF', '#818CF8'];
        if (community === 'None') return '#94A3B8';
        const hash = community.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    useEffect(() => {
        loadGraphData(view);
    }, [campaignId, view]);

    useEffect(() => {
        if (data.nodes.length > 0 && fgRef.current) {
            // Auto-center graph when data loads
            setTimeout(() => {
                fgRef.current.zoomToFit(800, 50);
            }, 500); // Wait for initial force simulation to settle slightly
        }
    }, [data]);

    const handleNodeClick = (node) => {
        if (isPathfindingMode) {
            if (!pathStartNode) {
                setPathStartNode(node);
            } else {
                findPath(node);
            }
            return;
        }

        setSelectedNode(node);
        // Center view on node
        fgRef.current.centerAt(node.x, node.y, 400);
        fgRef.current.zoom(1.5, 400);
    };

    const resetView = () => {
        fgRef.current.zoomToFit(400);
        setSelectedNode(null);
    };

    if (loading && data.nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[500px] bg-slate-900 rounded-xl border border-slate-700">
                <Loader className="w-10 h-10 animate-spin text-blue-400 mb-4" />
                <p className="text-slate-400">Loading Network Map...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setView('influence')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${view === 'influence'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <Users className="w-4 h-4" />
                        <span className="font-medium">Influencer Network</span>
                    </button>
                    <button
                        onClick={() => setView('topics')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${view === 'topics'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <Hash className="w-4 h-4" />
                        <span className="font-medium">Topic Clusters</span>
                    </button>
                    <button
                        onClick={() => setView('communities')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${view === 'communities'
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <Sparkles className="w-4 h-4" />
                        <span className="font-medium">Community Tribes</span>
                    </button>
                </div>

                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => {
                            setIsPathfindingMode(!isPathfindingMode);
                            setPathStartNode(null);
                            if (!isPathfindingMode) setSelectedNode(null);
                        }}
                        className={`p-2 rounded-lg transition-all ${isPathfindingMode ? 'bg-amber-100 text-amber-700' : 'hover:bg-slate-100 text-slate-600'}`}
                        title="Find Narrative Path"
                    >
                        <Zap className={`w-5 h-5 ${isPathfindingMode ? 'animate-pulse' : ''}`} />
                    </button>
                    <button
                        onClick={suggestPath}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                        title="Magic Wand: Auto-Find a Path"
                    >
                        <Sparkles className="w-5 h-5 text-purple-500" />
                    </button>
                    <button onClick={() => fgRef.current.zoom(fgRef.current.zoom() * 1.2)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Zoom In"><ZoomIn className="w-5 h-5" /></button>
                    <button onClick={() => fgRef.current.zoom(fgRef.current.zoom() * 0.8)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Zoom Out"><ZoomOut className="w-5 h-5" /></button>
                    <button onClick={resetView} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Reset View"><Maximize2 className="w-5 h-5" /></button>
                    <button
                        onClick={() => setShowHelp(true)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                        title="How to use"
                    >
                        <HelpCircle className="w-5 h-5" />
                    </button>
                    <button onClick={() => loadGraphData(view)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600" title="Refresh"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
                </div>
            </div>

            <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl h-[600px]">
                {/* Help Modal */}
                {showHelp && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm rounded-xl" onClick={() => setShowHelp(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-xl font-bold text-slate-800">Navigating the Network</h3>
                                <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-slate-600">
                                    <Maximize2 className="w-5 h-5 rotate-45" />
                                </button>
                            </div>
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2 text-blue-600 font-semibold">
                                            <Users className="w-4 h-4" />
                                            <span>Influencer Network</span>
                                        </div>
                                        <p className="text-sm text-slate-600">Visualizes who is talking to whom. Larger nodes have higher influence scores.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2 text-indigo-600 font-semibold">
                                            <Hash className="w-4 h-4" />
                                            <span>Topic Clusters</span>
                                        </div>
                                        <p className="text-sm text-slate-600">Shows the most discussed themes and how they connect different authors.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2 text-purple-600 font-semibold">
                                            <Sparkles className="w-4 h-4" />
                                            <span>Magic Wand</span>
                                        </div>
                                        <p className="text-sm text-slate-600">Automatically finds and highlights a "Narrative Bridge" between two connected people.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center space-x-2 text-amber-600 font-semibold">
                                            <Zap className="w-4 h-4" />
                                            <span>Interactive Path</span>
                                        </div>
                                        <p className="text-sm text-slate-600">Manually select a Start and Target node to see if a path exists between them.</p>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <h4 className="font-semibold text-slate-700 mb-2">💡 Tips</h4>
                                    <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                                        <li>Click any node to see detailed stats in the sidebar.</li>
                                        <li>Drag nodes to rearrange the view.</li>
                                        <li>Scroll to zoom in/out.</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                                <button onClick={() => setShowHelp(false)} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                                    Got it
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {data.nodes.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                            <MousePointer2 className="w-8 h-8 text-slate-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-200 mb-2">No Network Data Yet</h3>
                        <p className="max-w-md">Run a campaign analysis to populate the graph with influencer and topic connections.</p>
                    </div>
                ) : (
                    <>
                        <ForceGraph2D
                            ref={fgRef}
                            graphData={data}
                            nodeLabel={n => `${n.type}: ${n.label}${n.community ? ` (Tribe: ${n.community})` : ''}`}
                            nodeColor={n => n.color || (n.type === 'Author' ? '#60A5FA' : '#818CF8')}
                            nodeRelSize={7}
                            nodeVal={n => Math.sqrt(n.val || 1) * 3}
                            linkColor={l => l.isPathLink ? '#FBBF24' : 'rgba(255, 255, 255, 0.4)'}
                            linkWidth={l => l.isPathLink ? 4 : Math.sqrt(l.value || 1) * 1.5}
                            linkDirectionalParticles={l => l.isPathLink ? 4 : 2}
                            linkDirectionalParticleWidth={l => l.isPathLink ? 3 : 1}
                            linkDirectionalParticleSpeed={d => d.isPathLink ? 0.01 : Math.sqrt(d.value) * 0.001}
                            backgroundColor="#0f172a"
                            onNodeClick={handleNodeClick}
                            nodeCanvasObject={(node, ctx, globalScale) => {
                                const label = node.label;
                                const fontSize = 14 / globalScale;
                                ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
                                const textWidth = ctx.measureText(label).width;
                                const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                                // Draw node circle
                                const r = (Math.sqrt(node.val || 1) * 4) / globalScale;
                                ctx.fillStyle = node.color || (node.type === 'Author' ? '#60A5FA' : '#818CF8');

                                // Highlight if involved in pathfinding
                                if (pathStartNode && node.id === pathStartNode.id) {
                                    ctx.strokeStyle = '#FBBF24';
                                    ctx.lineWidth = 4 / globalScale;
                                    ctx.beginPath();
                                    ctx.arc(node.x, node.y, (r + 4) / globalScale, 0, 2 * Math.PI, false);
                                    ctx.stroke();

                                    // Pulse effect
                                    const pulseR = (r + 4 + Math.sin(Date.now() / 200) * 2) / globalScale;
                                    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
                                    ctx.beginPath();
                                    ctx.arc(node.x, node.y, pulseR, 0, 2 * Math.PI, false);
                                    ctx.stroke();
                                }

                                ctx.beginPath();
                                ctx.arc(node.x, node.y, Math.max(r, 4 / globalScale), 0, 2 * Math.PI, false);
                                ctx.fill();

                                // Draw label if zoomed in or node is important
                                if (globalScale > 0.8 || node.val > 5) {
                                    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
                                    ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y + (r + 2) / globalScale, bckgDimensions[0], bckgDimensions[1]);
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillStyle = '#f1f5f9';
                                    ctx.fillText(label, node.x, node.y + (r + 2 + fontSize / 2) / globalScale);
                                }
                            }}
                        />

                        {isPathfindingMode && (
                            <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 z-10 animate-bounce transition-colors duration-300 ${pathStatus === 'not_found' ? 'bg-red-600' : 'bg-amber-600'
                                }`}>
                                {pathStatus === 'searching' ? (
                                    <RefreshCw className="w-5 h-5 animate-spin text-white" />
                                ) : pathStatus === 'not_found' ? (
                                    <Maximize2 className="w-5 h-5 text-white" />
                                ) : (
                                    <Zap className="w-5 h-5 fill-current text-white" />
                                )}
                                <span className="font-bold text-white">
                                    {pathStatus === 'searching' ? 'Calculating Narrative Bridge...' :
                                        pathStatus === 'not_found' ? 'No Bridge Found - Try another target' :
                                            !pathStartNode ? 'Select START Influencer/Topic' : 'Now select TARGET Influencer/Topic'}
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsPathfindingMode(false); setPathStartNode(null); setPathStatus(null); }}
                                    className="ml-4 p-1 hover:bg-black/20 rounded-full text-white"
                                >
                                    <Maximize2 className="w-4 h-4 rotate-45" />
                                </button>
                            </div>
                        )}

                        {data.nodes.some(n => n.isPathNode) && (
                            <button
                                onClick={() => loadGraphData(view)}
                                className="absolute bottom-6 right-6 px-4 py-2 bg-slate-800 text-white rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors shadow-lg flex items-center space-x-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                <span>Clear Path</span>
                            </button>
                        )}
                    </>
                )}

                {/* Legend & Stats Overlay */}
                <div className="absolute bottom-6 left-6 flex flex-col space-y-2 pointer-events-none">
                    {view === 'communities' ? (
                        <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/80 backdrop-blur-md rounded-lg border border-slate-700">
                            <div className="flex -space-x-1">
                                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            </div>
                            <span className="text-xs text-slate-300 font-medium ml-2">Tribe Clusters</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/80 backdrop-blur-md rounded-lg border border-slate-700">
                                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                                <span className="text-xs text-slate-300 font-medium">Influencers</span>
                            </div>
                            <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/80 backdrop-blur-md rounded-lg border border-slate-700">
                                <div className="w-3 h-3 rounded-full bg-indigo-400"></div>
                                <span className="text-xs text-slate-300 font-medium">Topic Clusters</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Selected Node Sidebar/Panel */}
                {selectedNode && (
                    <div className="absolute top-6 right-6 w-72 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-right-8 duration-300">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${selectedNode.type === 'Author' ? 'bg-blue-500/20 text-blue-400' : 'bg-indigo-500/20 text-indigo-400'
                                }`}>
                                {selectedNode.type}
                            </div>
                            <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-slate-300">
                                <Maximize2 className="w-4 h-4 rotate-45" />
                            </button>
                        </div>

                        <h4 className="text-xl font-bold text-white mb-2">{selectedNode.label}</h4>

                        <div className="space-y-4">
                            {selectedNode.type === 'Author' ? (
                                <>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-700">
                                        <span className="text-slate-400 text-sm">Posts</span>
                                        <span className="text-white font-bold">{selectedNode.postCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-700">
                                        <span className="text-slate-400 text-sm">Topic Diversity</span>
                                        <span className="text-white font-bold">{selectedNode.topicDiversity}</span>
                                    </div>
                                    <div className="mt-4 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                        <div className="text-blue-400 text-[10px] uppercase font-bold mb-1">Influence Score</div>
                                        <div className="text-3xl font-black text-blue-400">{selectedNode.influenceScore}</div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-slate-400 text-sm italic">"A major theme emerging from your campaign data."</p>
                                    <div className="mt-4 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                                        <div className="text-indigo-400 text-[10px] uppercase font-bold mb-1">Mention Strength</div>
                                        <div className="text-3xl font-black text-indigo-400">{selectedNode.val}</div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};

export default GraphVisualization;
