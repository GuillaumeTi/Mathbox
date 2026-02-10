import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './Landing.css';

function Landing() {
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const features = [
        {
            title: 'Collaboration en Temps Réel',
            description: 'Connectez-vous avec vos étudiants via vidéo HD et partagez vos connaissances instantanément.',
            image: '/images/feature-collab.png',
            color: 'from-purple-500 to-blue-500'
        },
        {
            title: 'Double Caméra',
            description: 'Utilisez deux angles de caméra simultanément pour une meilleure visualisation des problèmes mathématiques.',
            image: '/images/feature-camera.png',
            color: 'from-blue-500 to-cyan-500'
        },
        {
            title: 'Annotations Interactives',
            description: 'Dessinez, annotez et expliquez en temps réel sur les flux vidéo pour une meilleure compréhension.',
            image: '/images/feature-annotations.png',
            color: 'from-cyan-500 to-purple-500'
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 transition-all duration-300"
                style={{
                    backgroundColor: scrollY > 50 ? 'rgba(15, 23, 42, 0.9)' : 'transparent',
                    backdropFilter: scrollY > 50 ? 'blur(10px)' : 'none'
                }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-2">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold text-xl">M</span>
                            </div>
                            <span className="text-white font-bold text-2xl">MathCam</span>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Link
                                to="/register"
                                className="text-gray-300 hover:text-white transition-colors duration-200 font-medium"
                            >
                                S'inscrire
                            </Link>
                            <Link
                                to="/login"
                                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                            >
                                Se Connecter
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
                {/* Animated background elements */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
                    <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
                    <div className="absolute top-40 left-40 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
                </div>

                <div className="max-w-7xl mx-auto relative">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div className="text-white space-y-6 animate-fade-in">
                            <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                                L'Avenir du
                                <span className="block bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                                    Tutorat Mathématique
                                </span>
                            </h1>
                            <p className="text-xl text-gray-300 leading-relaxed">
                                Une plateforme innovante de vidéoconférence avec double caméra et annotations en temps réel,
                                conçue spécialement pour l'enseignement des mathématiques.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                <Link
                                    to="/register"
                                    className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:scale-105 text-center"
                                >
                                    Commencer Gratuitement
                                </Link>
                                <Link
                                    to="/login"
                                    className="border-2 border-purple-400 text-purple-300 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-purple-400 hover:text-white transition-all duration-200 text-center"
                                >
                                    Se Connecter
                                </Link>
                            </div>
                        </div>
                        <div className="relative animate-fade-in-delay">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur-2xl opacity-30"></div>
                            <img
                                src="/images/hero.png"
                                alt="MathCam Platform"
                                className="relative rounded-2xl shadow-2xl w-full transform hover:scale-105 transition-transform duration-300"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Fonctionnalités Puissantes
                        </h2>
                        <p className="text-xl text-gray-300">
                            Tout ce dont vous avez besoin pour un tutorat mathématique efficace
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className="group relative bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 hover:bg-slate-800/70 transition-all duration-300 border border-slate-700 hover:border-purple-500 transform hover:scale-105 hover:shadow-2xl"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className={`absolute inset-0 bg-gradient-to-r ${feature.color} rounded-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
                                <div className="relative">
                                    <div className="mb-6 overflow-hidden rounded-xl">
                                        <img
                                            src={feature.image}
                                            alt={feature.title}
                                            className="w-full h-48 object-cover transform group-hover:scale-110 transition-transform duration-300"
                                        />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-3">
                                        {feature.title}
                                    </h3>
                                    <p className="text-gray-300 leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-3xl p-12 shadow-2xl transform hover:scale-105 transition-transform duration-300">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                            Prêt à Commencer ?
                        </h2>
                        <p className="text-xl text-purple-100 mb-8">
                            Rejoignez des milliers d'enseignants et d'étudiants qui utilisent MathCam pour améliorer leur apprentissage.
                        </p>
                        <Link
                            to="/register"
                            className="inline-block bg-white text-purple-600 px-10 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:scale-105"
                        >
                            Créer un Compte Gratuit
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-slate-900/50 backdrop-blur-sm border-t border-slate-800 py-8 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto text-center text-gray-400">
                    <p>&copy; 2026 MathCam. Plateforme de tutorat mathématique nouvelle génération.</p>
                </div>
            </footer>
        </div>
    );
}

export default Landing;
