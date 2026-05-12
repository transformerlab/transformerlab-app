import React, { useState, useRef, useEffect } from 'react';
import styles from './CustomNavbar.module.css';
import Link from '@docusaurus/Link';
import MultiNode from '../../pages/img/multinode.png';
import SingleNode from '../../pages/img/singlenode.png';
import Group from '../../pages/img/office.png';
import IconClose from '@theme/Icon/Close';
import { useHistory } from '@docusaurus/router';

export default function MyCustomToolbar() {
  const [showMegaMenu, setShowMegaMenu] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const timeoutRef = useRef(null);
  const menuRef = useRef(null);
  const navItemRef = useRef(null);
  const isNavHovering = useRef(false); // Track hover on nav item
  const isMenuHovering = useRef(false); // Track hover on megamenu
  const isMobile = useRef(false); // Initialize without window reference
  const history = useHistory();

  // Handle menu visibility with delay to prevent immediate closing
  useEffect(() => {
    // Update isMobile on initial load and window resize
    const handleResize = () => {
      isMobile.current =
        typeof window !== 'undefined' && window.innerWidth <= 768;
    };

    // Set initial value
    handleResize();

    // Add event listener only on client-side
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Handle hover state effect
  useEffect(() => {
    // Always clear any existing timeout to avoid race conditions
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isHovering) {
      // Show menu immediately when hovering
      setShowMegaMenu(true);
    } else if (!isMobile.current) {
      // Use a longer delay before hiding for better UX
      // This prevents the menu from flickering when moving between elements
      timeoutRef.current = setTimeout(() => {
        // Double-check hover state before hiding to prevent premature hiding
        if (!isNavHovering.current && !isMenuHovering.current) {
          setShowMegaMenu(false);
        }
      }, 100); // Extended delay for smoother experience
    }

    // Clean up timeout on component unmount or when effect re-runs
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isHovering]);

  // Handle mouse enter for entire navigation component
  const handleMouseEnter = (e) => {
    // Cancel any pending timeouts to prevent the menu from closing
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Set hovering state only if not on mobile
    if (!isMobile.current) {
      // Use a very small timeout to prevent race conditions
      setTimeout(() => {
        setIsHovering(true);
      }, 10);
    }
  };

  // Handle mouse leave with intent detection
  const handleMouseLeave = (e) => {
    if (isMobile.current) return;

    // Safe check for relatedTarget
    try {
      // Check if we're moving to a child element of the menu
      if (e.relatedTarget) {
        // Only attempt to use contains if both refs are valid DOM nodes
        if (
          menuRef.current &&
          e.relatedTarget instanceof Node &&
          menuRef.current.contains(e.relatedTarget)
        ) {
          return; // Moving to the mega menu
        }
        if (
          navItemRef.current &&
          e.relatedTarget instanceof Node &&
          navItemRef.current.contains(e.relatedTarget)
        ) {
          return; // Moving to the nav item
        }
      }
    } catch (error) {
      // Silently handle any errors with relatedTarget
      console.debug('Hover detection error handled:', error);
    }

    // Use a longer timeout for a better user experience
    timeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 100); // Longer delay for smoother experience
  };

  return (
    <div className={styles.customToolbar}>
      <div
        ref={navItemRef}
        className={styles.navItem}
        onMouseEnter={(e) => {
          isNavHovering.current = true;
          handleMouseEnter(e);
        }}
        onMouseLeave={(e) => {
          isNavHovering.current = false;
          handleMouseLeave(e);
        }}
      >
        <span
          className={styles.navTrigger}
          style={{
            fontWeight: 'bold',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              color: 'inherit',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onClick={(e) => {
              if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                e.preventDefault();
                const newState = !showMegaMenu;
                setShowMegaMenu(newState);
                setIsHovering(newState);
              } else {
                // setShowMegaMenu(false);
                // setIsHovering(false);
                history.push('/');
              }
            }}
          >
            <img src="/img/logo2.svg" alt="Transformer Lab Logo" height={30} />
            Transformer Lab
          </div>
          <button
            className={styles.mobileMenuToggle}
            onClick={() => {
              const newState = !showMegaMenu;
              setShowMegaMenu(newState);
              setIsHovering(newState);
            }}
            aria-label="Toggle menu"
            style={{ height: '24px', width: '24px', marginLeft: '8px' }}
          >
            {showMegaMenu ? <IconClose /> : ''}
          </button>
        </span>

        {/* Always render the menu but conditionally apply visible class */}
        <div
          ref={menuRef}
          className={`${styles.megaMenu} ${
            showMegaMenu ? styles.megaMenuVisible : ''
          }`}
          onMouseOver={(e) => {
            isMenuHovering.current = true;
            handleMouseEnter(e);
          }}
          onMouseLeave={(e) => {
            // Small delay before updating the state to prevent flicker
            setTimeout(() => {
              isMenuHovering.current = false;
              handleMouseLeave(e);
            }, 50);
          }}
        >
          <div className={styles.megaMenuContainer}>
            <div className={styles.megaMenuSection}>
              <img
                src={MultiNode}
                alt=""
                style={{
                  maxHeight: '100px',
                  maxWidth: '100%',
                  marginBottom: '10px',
                }}
              />
              <h3>Transformer Lab</h3>
              <p className={styles.subtitle}>&nbsp;</p>
              <div className={styles.megaMenuLinks}>
                <Link
                  to="/"
                  onClick={() => {
                    setShowMegaMenu(false);
                    setIsHovering(false);
                  }}
                >
                  Features
                </Link>
                <Link
                  to="/docs"
                  onClick={() => {
                    setShowMegaMenu(false);
                    setIsHovering(false);
                  }}
                >
                  Documentation
                </Link>
              </div>
            </div>

            <div className={styles.megaMenuSection}>
              <img
                src={Group}
                alt=""
                style={{
                  maxHeight: '100px',
                  maxWidth: '100%',
                  marginBottom: '10px',
                }}
              />
              <h3>About Us</h3>
              <p className={styles.subtitle}>&nbsp;</p>

              <div className={styles.megaMenuLinks}>
                <Link
                  to="/about"
                  onClick={() => {
                    setShowMegaMenu(false);
                    setIsHovering(false);
                  }}
                >
                  Team
                </Link>
                <Link
                  to="/blog"
                  onClick={() => {
                    setShowMegaMenu(false);
                    setIsHovering(false);
                  }}
                >
                  Blog
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
