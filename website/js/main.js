/**
 * Email Obfuscation and Utility Functions
 */

// Email obfuscation using ROT13-like encoding
const EmailObfuscator = (() => {
  const baseEmail = 'georgeelliottdeveloper@gmail.com';
  
  // Simple character shift for obfuscation
  const obfuscate = (email) => {
    return btoa(email);
  };
  
  const deobfuscate = (encoded) => {
    try {
      return atob(encoded);
    } catch (e) {
      console.error('Error deobfuscating email:', e);
      return baseEmail;
    }
  };
  
  return {
    getObfuscated: () => obfuscate(baseEmail),
    getOriginal: () => baseEmail,
    decode: (encoded) => deobfuscate(encoded),
    setupButton: () => {
      const button = document.getElementById('reveal-email-btn');
      const display = document.getElementById('email-display');
      const obfuscated = obfuscate(baseEmail);
      
      if (button && display) {
        let isRevealed = false;
        
        button.addEventListener('click', () => {
          isRevealed = !isRevealed;
          if (isRevealed) {
            const link = document.createElement('a');
            link.href = 'mailto:' + baseEmail;
            link.textContent = baseEmail;
            link.style.color = 'var(--primary)';
            display.innerHTML = '';
            display.appendChild(link);
            button.textContent = 'Hide Email';
            button.style.background = 'linear-gradient(135deg, #FF6B6B 0%, #FF8787 100%)';
          } else {
            display.textContent = obfuscated;
            button.textContent = 'Reveal Email';
            button.style.background = 'linear-gradient(135deg, #1E88E5 0%, #42A5F5 100%)';
          }
        });
        
        // Show obfuscated version by default
        display.textContent = obfuscated;
      }
    }
  };
})();

// Navigation smooth scrolling
const Navigation = (() => {
  const setupScrollListeners = () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    });
  };

  return {
    init: setupScrollListeners
  };
})();

// Store link tracking and handling
const StoreLinks = (() => {
  const links = {
    firefox: 'https://addons.mozilla.org/en-GB/firefox/addon/watchhistory-for-youtube/',
    chrome: 'https://chromewebstore.google.com/detail/watchhistory-for-youtube/bjfbnpccgejpbeofaepnjommafgdknap?authuser=0&hl=en',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/watchhistory-for-youtube%E2%84%A2/dddoogddjkbiknfieibadpibibmmkpnj',
    github: 'https://github.com/GeorgeElliott/yt-watch-history'
  };

  const setupLinks = () => {
    Object.entries(links).forEach(([key, url]) => {
      const elements = document.querySelectorAll(`[data-store="${key}"]`);
      elements.forEach(el => {
        el.href = url;
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
        el.addEventListener('click', () => trackClick(key));
      });
    });
  };

  const trackClick = (storeName) => {
    // Send tracking event if analytics available
    if (window.gtag) {
      gtag('event', 'store_click', {
        store: storeName,
        timestamp: new Date().toISOString()
      });
    }
  };

  return {
    init: setupLinks,
    getLinks: () => links
  };
})();

// Mobile menu toggle
const MobileMenu = (() => {
  const setupToggle = () => {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.getElementById('nav-menu');
    
    if (menuBtn && navMenu) {
      // Toggle menu on button click
      menuBtn.addEventListener('click', () => {
        menuBtn.classList.toggle('active');
        navMenu.classList.toggle('active');
      });
      
      // Close menu when a link is clicked
      navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          menuBtn.classList.remove('active');
          navMenu.classList.remove('active');
        });
      });
      
      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!menuBtn.contains(e.target) && !navMenu.contains(e.target)) {
          menuBtn.classList.remove('active');
          navMenu.classList.remove('active');
        }
      });
    }
  };

  return {
    init: setupToggle
  };
})();

// Intersection Observer for lazy animations
const LazyAnimations = (() => {
  const setupObserver = () => {
    const elements = document.querySelectorAll('[data-animate="fade"]');
    
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });

      elements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
      });
    }
  };

  return {
    init: setupObserver
  };
})();

// Initialize everything on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  EmailObfuscator.setupButton();
  Navigation.init();
  StoreLinks.init();
  MobileMenu.init();
  LazyAnimations.init();
});

// Copy to clipboard utility for email reveal
window.copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    const button = document.getElementById('reveal-email-btn');
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    alert('Email: ' + text);
  });
};
